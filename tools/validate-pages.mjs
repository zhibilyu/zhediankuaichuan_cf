import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set(['.html', '.js', '.json', '.css']);
const requiredFiles = [
  '_headers',
  '_redirects',
  'app-shell.css',
  'app-shell.js',
  'favicon.ico',
  'icon-192x192.png',
  'icon-512x512.png',
  'icon-512x512-maskable.png',
  'index.html',
  'recv.html',
  'recv-sw.js',
  'sw.js',
];

const mobileReceiverExpectations = [
  '<html lang="zh-CN"',
  '<title>浙电快传</title>',
  'app-shell.css',
  'app-shell.js',
  'id="zdkc-app"',
  'id="app_title"',
  'id="menu_reset"',
  'id="menu_usage"',
  'id="menu_about"',
  'id="receive_progress_panel"',
  'id="camera_start"',
  'id="status_panel"',
  '对准动态码开始接收。',
  'ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk',
  'pwa-recv.2026-05-09T0146.json',
  "navigator.serviceWorker.register('./recv-sw.js')",
  'recv.2026-05-09T0146.js',
  'zstd.2026-05-09T0146.js',
];

const shellFiles = [
  '/app-shell.css',
  '/app-shell.js',
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tools') {
        return [];
      }
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function existsWebPath(ref, fromFile) {
  const withoutFragment = ref.split('#')[0].split('?')[0];
  if (!withoutFragment || withoutFragment === '/') {
    return true;
  }
  if (/^(https?:|data:|javascript:|mailto:)/i.test(withoutFragment)) {
    return true;
  }

  const candidate = withoutFragment.startsWith('/')
    ? path.join(root, withoutFragment.slice(1))
    : path.resolve(path.dirname(fromFile), withoutFragment);
  return fs.existsSync(candidate);
}

function collectRefs(file, content) {
  const refs = new Set();
  const patterns = [
    /\b(?:src|href)=["']([^"']+)["']/g,
    /\bimportScripts\(\s*["']([^"']+)["']\s*\)/g,
    /\bnew\s+Worker\(\s*["']([^"']+)["']/g,
    /["'](\/?[\w./-]+\.(?:html|js|css|wasm|json|ico|png))["']/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      refs.add(match[1]);
    }
  }

  return [...refs].map((ref) => ({ from: relative(file), ref }));
}

const errors = [];

for (const required of requiredFiles) {
  if (!fs.existsSync(path.join(root, required))) {
    errors.push(`Missing required file: ${required}`);
  }
}

const wasmFiles = walk(root).filter((file) => path.basename(file).match(/^cimbar_js\..+\.wasm$/));
const wasmLoaderFiles = walk(root).filter((file) => path.basename(file).match(/^cimbar_js\..+\.js$/));
if (wasmFiles.length !== 1) {
  errors.push(`Expected exactly one versioned cimbar_js WASM file, found ${wasmFiles.length}`);
}
if (wasmLoaderFiles.length !== 1) {
  errors.push(`Expected exactly one versioned cimbar_js JS loader file, found ${wasmLoaderFiles.length}`);
}

for (const file of walk(root)) {
  if (!textExtensions.has(path.extname(file))) {
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('%VERSION%')) {
    errors.push(`${relative(file)} still contains %VERSION%`);
  }

  for (const { from, ref } of collectRefs(file, content)) {
    if (!existsWebPath(ref, file)) {
      errors.push(`${from} references missing asset: ${ref}`);
    }
  }
}

const headersPath = path.join(root, '_headers');
if (fs.existsSync(headersPath)) {
  const headers = fs.readFileSync(headersPath, 'utf8');
  if (!headers.includes('Content-Type: application/wasm')) {
    errors.push('_headers must serve .wasm as application/wasm');
  }
  if (!headers.includes('Service-Worker-Allowed: /')) {
    errors.push('_headers must allow root-scoped service workers');
  }
}

const indexPath = path.join(root, 'index.html');
if (fs.existsSync(indexPath)) {
  const index = fs.readFileSync(indexPath, 'utf8');
  for (const expected of mobileReceiverExpectations) {
    if (!index.includes(expected)) {
      errors.push(`index.html must be the mobile ZheDianKuaiChuan receiver and include: ${expected}`);
    }
  }
  if (index.includes('<title>Cimbar Encoder</title>') || index.includes('<title>Cimbar Decoder</title>')) {
    errors.push('index.html must not expose the legacy Cimbar encoder/decoder title');
  }
}

const recvPath = path.join(root, 'recv.html');
if (fs.existsSync(indexPath) && fs.existsSync(recvPath)) {
  const index = fs.readFileSync(indexPath, 'utf8');
  const recv = fs.readFileSync(recvPath, 'utf8');
  if (index !== recv) {
    errors.push('recv.html must match index.html so receiver aliases share the Android-style shell');
  }
}

const manifestPath = path.join(root, 'pwa-recv.2026-05-09T0146.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.lang !== 'zh-CN') {
    errors.push('receiver manifest lang must be zh-CN');
  }
  if (manifest.name !== '浙电快传' || manifest.short_name !== '浙电快传') {
    errors.push('receiver manifest name and short_name must be 浙电快传');
  }
  if (manifest.start_url !== '/') {
    errors.push('receiver manifest start_url must be /');
  }
  if (manifest.display !== 'fullscreen') {
    errors.push('receiver manifest display must remain fullscreen');
  }
}

const shellCssPath = path.join(root, 'app-shell.css');
if (fs.existsSync(shellCssPath)) {
  const css = fs.readFileSync(shellCssPath, 'utf8');
  const cssExpectations = [
    '--scan-top:',
    '--scan-bottom:',
    '--scan-size: 100vw',
    '--bottom-panel-height:',
    'top: var(--scan-top) !important',
    'bottom: var(--scan-bottom) !important',
    'right: 0 !important',
    'left: 0 !important',
  ];

  for (const expected of cssExpectations) {
    if (!css.includes(expected)) {
      errors.push(`app-shell.css must pin camera crosshairs away from the header: ${expected}`);
    }
  }

  if (css.includes('--scan-offset')) {
    errors.push('app-shell.css must not use the old centered --scan-offset crosshair layout');
  }
  if (css.includes('--scan-frame-left') || css.includes('--scan-frame-size')) {
    errors.push('app-shell.css must not use the centered scan-frame layout; the scan frame should stay full-width');
  }
}

for (const swName of ['recv-sw.js', 'sw.js']) {
  const swPath = path.join(root, swName);
  if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, 'utf8');
    for (const shellFile of shellFiles) {
      if (!sw.includes(shellFile)) {
        errors.push(`${swName} must cache ${shellFile}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Cloudflare Pages validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Cloudflare Pages validation passed for ${relative(root)}.`);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set(['.html', '.js', '.json']);
const requiredFiles = [
  '_headers',
  '_redirects',
  'favicon.ico',
  'icon-192x192.png',
  'icon-512x512.png',
  'icon-512x512-maskable.png',
  'index.html',
  'recv.html',
  'recv-sw.js',
  'sw.js',
];

const decoderRootExpectations = [
  '<title>Cimbar Decoder</title>',
  'pwa-recv.2026-05-09T0146.json',
  "navigator.serviceWorker.register('./recv-sw.js')",
  'recv.2026-05-09T0146.js',
  'zstd.2026-05-09T0146.js',
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
    /["'](\/?[\w./-]+\.(?:html|js|wasm|json|ico|png))["']/g,
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
  for (const expected of decoderRootExpectations) {
    if (!index.includes(expected)) {
      errors.push(`index.html must be the decoder entry and include: ${expected}`);
    }
  }
  if (index.includes('<title>Cimbar Encoder</title>')) {
    errors.push('index.html must not be the encoder entry');
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

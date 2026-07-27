import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textExtensions = new Set(['.html', '.js', '.json', '.css']);
const requiredFiles = [
  '_headers',
  '_redirects',
  'anchor-repair.js',
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

const pageVersion = '20260727-220839-safarishare1';

const mobileReceiverExpectations = [
  '<html lang="zh-CN"',
  '<title>浙电快传</title>',
  `app-shell.css?v=${pageVersion}`,
  `anchor-repair.js?v=${pageVersion}`,
  `app-shell.js?v=${pageVersion}`,
  'id="zdkc-app"',
  'id="app_title"',
  'id="camera_canvas"',
  'id="menu_reset"',
  'id="menu_usage"',
  'id="menu_about"',
  'id="receive_progress_panel"',
  'id="camera_start"',
  'id="status_panel"',
  '对准动态码开始接收。',
  'ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk',
  'pwa-recv.2026-05-09T0146.json',
  `navigator.serviceWorker.register('./recv-sw.js?v=${pageVersion}')`,
  `recv.2026-05-09T0146.js?v=${pageVersion}`,
  'zstd.2026-05-09T0146.js',
];

const shellFiles = [
  `/anchor-repair.js?v=${pageVersion}`,
  `/app-shell.css?v=${pageVersion}`,
  `/app-shell.js?v=${pageVersion}`,
  `/recv.2026-05-09T0146.js?v=${pageVersion}`,
  `/recv-worker.2026-05-09T0146.js?v=${pageVersion}`,
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

function coverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  return {
    sw: targetWidth / scale,
    sh: targetHeight / scale,
    sx: Math.max(0, (sourceWidth - targetWidth / scale) / 2),
    sy: Math.max(0, (sourceHeight - targetHeight / scale) / 2),
  };
}

const landscapeToSquare = coverCrop(1920, 1080, 430, 430);
if (
  Math.round(landscapeToSquare.sw) !== 1080 ||
  Math.round(landscapeToSquare.sh) !== 1080 ||
  Math.round(landscapeToSquare.sx) !== 420 ||
  Math.round(landscapeToSquare.sy) !== 0
) {
  errors.push('canvas preview cover crop must crop the left/right sides of a landscape camera stream when drawn into the square scan frame');
}

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
  if (!headers.includes('/app-shell.css') || !headers.includes('/app-shell.js') || !headers.includes('Cache-Control: no-cache')) {
    errors.push('_headers must keep app-shell.css and app-shell.js out of immutable browser cache');
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
    '--scan-corner-size:',
    '--bottom-panel-height:',
    'height: var(--scan-size);',
    'padding: calc(env(safe-area-inset-top, 0px) + 22px) 0 0 20px;',
    'top: calc(var(--scan-top) + var(--scan-size));',
    '#camera_canvas',
    'inset: 0;',
    'opacity: 0;',
    'top: var(--scan-top) !important',
    'top: calc(var(--scan-top) + var(--scan-size) - var(--scan-corner-size)) !important',
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

const shellJsPath = path.join(root, 'app-shell.js');
if (fs.existsSync(shellJsPath)) {
  const js = fs.readFileSync(shellJsPath, 'utf8');
  const jsExpectations = [
    `页面版本：${pageVersion}`,
    "usageBody: '1. 将摄像头对准发送端显示的动态码。\\n2. 接收过程中保持手机稳定。\\n3. 接收完成后可直接分享；浏览器不支持的格式请保存到本地后分享。'",
    "shareOtherApps: '分享到其他应用'",
    "shareUnavailable: '当前浏览器不支持直接分享文件，请使用保存到本地。'",
    "shareTypeUnsupported: '当前浏览器不支持直接分享此文件格式，请使用保存到本地。'",
    "shareFailed: '系统分享未能打开，请使用保存到本地。'",
    '{ label: text.shareOtherApps, close: false, handler: sharePendingFile }',
    'type: inferShareMimeType(state.pendingFile.name, state.pendingFile.blob.type)',
    'state.nativeDownload(state.pendingFile.name, downloadBlob);',
    'function resizeCameraCanvas()',
    'function detectActiveVideoBounds(video)',
    'function getCoverCrop(source, targetWidth, targetHeight)',
    'function trimLandscapeSourceInPortrait(source, video)',
    'function drawCameraCanvasFrame()',
    "getImageData(0, 0, sampleWidth, sampleHeight)",
    'const activeBounds = detectActiveVideoBounds(video)',
    'const activeBounds = trimLandscapeSourceInPortrait(state.activeVideoBounds, video)',
    'const crop = getCoverCrop(activeBounds, canvas.width, canvas.height)',
    'ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)',
    "canvas.classList.add('is-live')",
    'requestAnimationFrame(drawCameraCanvasFrame)',
  ];

  for (const expected of jsExpectations) {
    if (!js.includes(expected)) {
      errors.push(`app-shell.js must render a full-height canvas camera preview and expose the page version: ${expected}`);
    }
  }

  const shareFunction = js.match(
    /async function sharePendingFile\(\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  function showReceivedDialog/
  );
  if (!shareFunction) {
    errors.push('app-shell.js must define sharePendingFile before showReceivedDialog');
  } else {
    if (shareFunction[0].includes('savePendingFile()')) {
      errors.push('sharePendingFile must not download a fallback copy');
    }
    if (!/const payload = \{\s*files: \[file\]\s*\};/.test(shareFunction[0])) {
      errors.push('sharePendingFile must send files only for Safari compatibility');
    }
    if (!shareFunction[0].includes("error.name === 'AbortError'")) {
      errors.push('sharePendingFile must treat closing the system share sheet as a user cancellation');
    }
  }

  const mimeTableMatch = js.match(
    /const SHARE_MIME_TYPES = Object\.freeze\((\{[\s\S]*?\})\);/
  );
  const mimeFunctionMatch = js.match(
    /function inferShareMimeType\(fileName, declaredType\) \{[\s\S]*?\r?\n  \}/
  );
  if (!mimeTableMatch || !mimeFunctionMatch) {
    errors.push('app-shell.js must define a testable file-extension MIME map for Web Share');
  } else {
    const mimeContext = {};
    vm.runInNewContext(
      `const SHARE_MIME_TYPES = ${mimeTableMatch[1]}; ${mimeFunctionMatch[0]}; result = [
        inferShareMimeType('report.pdf', ''),
        inferShareMimeType('PHOTO.JPG', 'application/octet-stream'),
        inferShareMimeType('document.docx', ''),
        inferShareMimeType('notebook.ipynb', ''),
        inferShareMimeType('archive.unknown', '')
      ];`,
      mimeContext
    );
    const expectedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/x-ipynb+json',
      'application/octet-stream',
    ];
    if (JSON.stringify(mimeContext.result) !== JSON.stringify(expectedMimeTypes)) {
      errors.push('file-extension MIME inference must preserve PDF, image, Office, notebook, and unknown files');
    }
  }
}

const recvRuntimePath = path.join(root, 'recv.2026-05-09T0146.js');
if (fs.existsSync(recvRuntimePath)) {
  const recvRuntime = fs.readFileSync(recvRuntimePath, 'utf8');
  const recvExpectations = [
    "const isPortrait = matchMedia('all and (orientation:portrait)').matches",
    'const idealWidth = isPortrait ? 1080 : 1920',
    'const idealHeight = isPortrait ? 1920 : 1080',
    'aspectRatio: { ideal: isPortrait ? 9 / 16 : 16 / 9 }',
    'function _copyDecodeCanvasFrame()',
    'CimbarAnchorRepair.copyFrame(_video)',
    'document.getElementById("camera_canvas")',
    'var _decodeSize = 1024',
    'ctx.drawImage(canvas, 0, 0, _decodeSize, _decodeSize)',
    'const image = ctx.getImageData(0, 0, _decodeSize, _decodeSize)',
    'const frame = _copyAnchorRepairedFrame() || _copyDecodeCanvasFrame() || _copyVideoFrame(now)',
    'const modeVals = [4, 68]',
    'format: "RGB"',
    `new Worker('recv-worker.2026-05-09T0146.js?v=${pageVersion}')`,
  ];

  for (const expected of recvExpectations) {
    if (!recvRuntime.includes(expected)) {
      errors.push(`recv runtime must request a portrait camera stream on phones and crop it in the page: ${expected}`);
    }
  }
}

const anchorRepairPath = path.join(root, 'anchor-repair.js');
if (fs.existsSync(anchorRepairPath)) {
  const context = { console };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(anchorRepairPath, 'utf8'), context, {
    filename: anchorRepairPath,
  });

  const repair = context.CimbarAnchorRepair;
  if (
    !repair ||
    typeof repair.findAnchorCenters !== 'function' ||
    typeof repair.paintAnchor !== 'function' ||
    typeof repair.copyFrame !== 'function'
  ) {
    errors.push('anchor-repair.js must expose findAnchorCenters, paintAnchor, and copyFrame');
  } else {
    const width = 240;
    const height = 135;
    const pixels = new Uint8ClampedArray(width * height * 4);

    function setPixel(x, y, red, green, blue) {
      const offset = (y * width + x) * 4;
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        setPixel(x, y, 238, 238, 238);
      }
    }

    for (let y = 18; y <= 116; y += 1) {
      for (let x = 58; x <= 157; x += 1) {
        const magenta = (x + y) % 2 === 0;
        setPixel(x, y, magenta ? 245 : 0, magenta ? 0 : 230, magenta ? 210 : 70);
      }
    }

    const expectedCenters = [
      { x: 64, y: 24, secondary: false },
      { x: 151, y: 24, secondary: false },
      { x: 64, y: 110, secondary: false },
      { x: 151, y: 110, secondary: true },
    ];
    for (const center of expectedCenters) {
      repair.paintAnchor(pixels, width, height, center.x, center.y, 14, center.secondary);
    }

    const detected = repair.findAnchorCenters(pixels, width, height, width, height);
    if (!Array.isArray(detected) || detected.length !== 4) {
      errors.push('anchor repair must detect all four locator centers in a colorful frame with a white surround');
    } else {
      for (let index = 0; index < expectedCenters.length; index += 1) {
        const actual = detected[index];
        const expected = expectedCenters[index];
        if (Math.abs(actual.x - expected.x) > 2 || Math.abs(actual.y - expected.y) > 2) {
          errors.push(`anchor repair locator ${index} is not centered on the expected marker`);
        }
      }
    }
  }
}

const recvWorkerPath = path.join(root, 'recv-worker.2026-05-09T0146.js');
if (fs.existsSync(recvWorkerPath)) {
  const recvWorker = fs.readFileSync(recvWorkerPath, 'utf8');
  const rgbTypeMapping = 'if (format == "RGB") {\n        type = 3;\n      }';
  if (!recvWorker.includes(rgbTypeMapping)) {
    errors.push('recv worker must pass packed RGB camera frames to wasm with pixel type 3');
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

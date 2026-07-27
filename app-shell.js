(function () {
  'use strict';

  const text = {
    idle: '对准动态码开始接收。',
    receiving: '正在接收文件，不要晃动手机。保证二维码定位点全部在方框以内，可通过微调手机和二维码的距离远近找到最佳传输速度。',
    progress: (percent) => `已接收 ${percent}%`,
    resetDone: '已重置，可以接收新文件。',
    receivedTitle: '文件接收完成',
    receivedStatus: (name) => `已接收文件：${name}\n点击处理`,
    usageTitle: '使用说明',
    usageBody: '1. 将摄像头对准发送端显示的动态码。\n2. 接收过程中保持手机稳定。\n3. 接收完成后可直接分享；浏览器不支持的格式请保存到本地后分享。',
    aboutTitle: '关于',
    aboutBody: '作者：吕知彼\n版本号：0.6.6-zd15d (42)\n页面版本：20260727-220839-safarishare1\n安装包：ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk',
    saveLocal: '保存到本地',
    shareOtherApps: '分享到其他应用',
    close: '确定',
    reset: '重置',
    shareUnavailable: '当前浏览器不支持直接分享文件，请使用保存到本地。',
    shareTypeUnsupported: '当前浏览器不支持直接分享此文件格式，请使用保存到本地。',
    shareFailed: '系统分享未能打开，请使用保存到本地。'
  };

  const SHARE_MIME_TYPES = Object.freeze({
    '.7z': 'application/x-7z-compressed',
    '.apk': 'application/vnd.android.package-archive',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ehtml': 'text/html',
    '.epub': 'application/epub+zip',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.gz': 'application/gzip',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.ico': 'image/x-icon',
    '.ipynb': 'application/x-ipynb+json',
    '.jfif': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.key': 'application/vnd.apple.keynote',
    '.m4a': 'audio/x-m4a',
    '.m4v': 'video/mp4',
    '.md': 'text/markdown',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.numbers': 'application/vnd.apple.numbers',
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.ogm': 'video/ogg',
    '.ogv': 'video/ogg',
    '.opus': 'audio/ogg',
    '.pages': 'application/vnd.apple.pages',
    '.pdf': 'application/pdf',
    '.pjp': 'image/jpeg',
    '.pjpeg': 'image/jpeg',
    '.png': 'image/png',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.rar': 'application/vnd.rar',
    '.rtf': 'application/rtf',
    '.shtm': 'text/html',
    '.shtml': 'text/html',
    '.svg': 'image/svg+xml',
    '.svgz': 'image/svg+xml',
    '.tar': 'application/x-tar',
    '.text': 'text/plain',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.weba': 'audio/webm',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.xbm': 'image/x-xbitmap',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml',
    '.zip': 'application/zip'
  });

  const state = {
    pendingFile: null,
    nativeDownload: null,
    toastTimer: 0,
    cameraCanvasRunning: false,
    cameraCanvasFrame: 0,
    activeVideoBounds: null,
    sampleCanvas: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(message, actionable) {
    const status = $('status_panel');
    status.textContent = message;
    status.classList.toggle('is-actionable', Boolean(actionable));
  }

  function showToast(message) {
    const toast = $('app_toast');
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function closeDialog() {
    $('app_dialog').hidden = true;
    $('dialog_actions').replaceChildren();
  }

  function openDialog(title, body, actions) {
    $('dialog_title').textContent = title;
    $('dialog_body').textContent = body;

    const actionBox = $('dialog_actions');
    actionBox.replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      if (action.secondary) {
        button.className = 'secondary';
      }
      button.addEventListener('click', () => {
        if (action.close !== false) {
          closeDialog();
        }
        action.handler();
      });
      actionBox.appendChild(button);
    }

    $('app_dialog').hidden = false;
  }

  function resetReceiver() {
    sessionStorage.setItem('zdkc-toast', text.resetDone);
    window.location.reload();
  }

  function updateProgress(report) {
    const values = Array.isArray(report)
      ? report.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    if (values.length === 0) {
      return;
    }

    const percent = Math.max(0, Math.min(100, Math.round(Math.max(...values) * 100)));
    const progressPanel = $('receive_progress_panel');
    const firstBar = $('progress_bars').querySelector('.progress');
    const extraBars = $('progress_bars').querySelectorAll('.progress:nth-child(n+2)');

    for (const bar of extraBars) {
      bar.remove();
    }

    progressPanel.hidden = false;
    firstBar.style.width = `${percent}%`;
    $('receive_progress_text').textContent = text.progress(percent);
    setStatus(text.receiving, false);
  }

  function hideProgress() {
    $('receive_progress_panel').hidden = true;
    $('receive_progress_text').textContent = text.progress(0);
    const firstBar = $('progress_bars').querySelector('.progress');
    if (firstBar) {
      firstBar.style.width = '0%';
    }
  }

  function inferShareMimeType(fileName, declaredType) {
    const normalizedName = String(fileName || '').toLowerCase();
    const extensionStart = normalizedName.lastIndexOf('.');
    const extension = extensionStart >= 0 ? normalizedName.slice(extensionStart) : '';
    const normalizedType = String(declaredType || '').trim().toLowerCase();
    return SHARE_MIME_TYPES[extension] || normalizedType || 'application/octet-stream';
  }

  function savePendingFile() {
    if (!state.pendingFile || !state.nativeDownload) {
      return;
    }
    const downloadBlob = new Blob([state.pendingFile.blob], {
      type: inferShareMimeType(state.pendingFile.name, state.pendingFile.blob.type)
    });
    state.nativeDownload(state.pendingFile.name, downloadBlob);
    setStatus(text.receivedStatus(state.pendingFile.name), true);
  }

  async function sharePendingFile() {
    if (!state.pendingFile) {
      return;
    }

    if (typeof navigator.share !== 'function') {
      showToast(text.shareUnavailable);
      return;
    }

    try {
      const file = new File([state.pendingFile.blob], state.pendingFile.name, {
        type: inferShareMimeType(state.pendingFile.name, state.pendingFile.blob.type)
      });
      const payload = {
        files: [file]
      };

      if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
        showToast(text.shareTypeUnsupported);
        return;
      }

      await navigator.share(payload);
      closeDialog();
      setStatus(text.receivedStatus(state.pendingFile.name), true);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return;
      }
      console.warn('share failed', error);
      if (error && (error.name === 'NotAllowedError' || error.name === 'TypeError')) {
        showToast(text.shareTypeUnsupported);
        return;
      }
      showToast(text.shareFailed);
    }
  }

  function showReceivedDialog() {
    if (!state.pendingFile) {
      return;
    }

    openDialog(text.receivedTitle, state.pendingFile.name, [
      { label: text.saveLocal, handler: savePendingFile },
      { label: text.shareOtherApps, close: false, handler: sharePendingFile },
      { label: text.reset, secondary: true, handler: resetReceiver }
    ]);
  }

  function onFileReady(name, blob) {
    state.pendingFile = { name, blob };
    hideProgress();
    setStatus(text.receivedStatus(name), true);
    showReceivedDialog();
  }

  function patchRecv() {
    if (!window.Recv) {
      return;
    }

    const originalSetHtml = Recv.set_HTML.bind(Recv);
    Recv.set_HTML = function (id, message, onlyIfUnset) {
      if (id === 'crosshair1' && String(message).includes('Failed to initialize camera')) {
        setStatus(message, false);
        return;
      }
      originalSetHtml(id, message, onlyIfUnset);
    };

    const originalRenderProgress = Recv.render_progress.bind(Recv);
    Recv.render_progress = function (report) {
      originalRenderProgress(report);
      updateProgress(report);
    };

    const originalSetError = Recv.set_error.bind(Recv);
    Recv.set_error = function (message) {
      setStatus(message, false);
      return originalSetError(message);
    };
  }

  function patchZstd() {
    if (!window.Zstd) {
      return;
    }

    state.nativeDownload = Zstd.download_blob.bind(Zstd);
    Zstd.download_blob = function (name, blob) {
      onFileReady(name, blob);
    };
  }

  function bindUi() {
    $('menu_reset').addEventListener('click', resetReceiver);
    $('menu_usage').addEventListener('click', () => {
      openDialog(text.usageTitle, text.usageBody, [
        { label: text.close, handler: function () {} }
      ]);
    });
    $('menu_about').addEventListener('click', () => {
      openDialog(text.aboutTitle, text.aboutBody, [
        { label: text.close, handler: function () {} }
      ]);
    });
    $('status_panel').addEventListener('click', showReceivedDialog);
    $('app_dialog').addEventListener('click', (event) => {
      if (event.target === $('app_dialog')) {
        closeDialog();
      }
    });
  }

  function videoLooksLive(video) {
    return Boolean(
      video &&
      video.srcObject &&
      video.readyState >= 2 &&
      !video.paused &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );
  }

  function resizeCameraCanvas() {
    const container = $('container');
    const canvas = $('camera_canvas');
    if (!container || !canvas) {
      return;
    }

    const box = container.getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }

    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const width = Math.round(box.width * pixelRatio);
    const height = Math.round(box.height * pixelRatio);

    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function detectActiveVideoBounds(video) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      return null;
    }

    const sampleMax = 128;
    const sampleScale = Math.min(1, sampleMax / Math.max(sourceWidth, sourceHeight));
    const sampleWidth = Math.max(1, Math.round(sourceWidth * sampleScale));
    const sampleHeight = Math.max(1, Math.round(sourceHeight * sampleScale));
    const sampleCanvas = state.sampleCanvas || document.createElement('canvas');
    state.sampleCanvas = sampleCanvas;
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;

    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }

    try {
      ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
      const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
      let minX = sampleWidth;
      let minY = sampleHeight;
      let maxX = -1;
      let maxY = -1;
      let activePixels = 0;

      for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
          const index = (y * sampleWidth + x) * 4;
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const brightness = red + green + blue;

          if (brightness > 42) {
            activePixels += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (activePixels < sampleWidth * sampleHeight * 0.015 || maxX < minX || maxY < minY) {
        return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
      }

      const padX = Math.max(1, Math.round(sampleWidth * 0.02));
      const padY = Math.max(1, Math.round(sampleHeight * 0.02));
      minX = Math.max(0, minX - padX);
      minY = Math.max(0, minY - padY);
      maxX = Math.min(sampleWidth - 1, maxX + padX);
      maxY = Math.min(sampleHeight - 1, maxY + padY);

      return {
        sx: minX / sampleScale,
        sy: minY / sampleScale,
        sw: (maxX - minX + 1) / sampleScale,
        sh: (maxY - minY + 1) / sampleScale
      };
    } catch (error) {
      return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
    }
  }

  function getCoverCrop(source, targetWidth, targetHeight) {
    if (!source || !source.sw || !source.sh || !targetWidth || !targetHeight) {
      return source;
    }

    const scale = Math.max(targetWidth / source.sw, targetHeight / source.sh);
    const cropWidth = targetWidth / scale;
    const cropHeight = targetHeight / scale;

    return {
      sx: source.sx + Math.max(0, (source.sw - cropWidth) / 2),
      sy: source.sy + Math.max(0, (source.sh - cropHeight) / 2),
      sw: cropWidth,
      sh: cropHeight
    };
  }

  function trimLandscapeSourceInPortrait(source, video) {
    if (!source || !video || window.innerHeight <= window.innerWidth || video.videoWidth <= video.videoHeight) {
      return source;
    }

    return {
      sx: source.sx,
      sy: source.sy,
      sw: source.sw,
      sh: source.sh * 0.92
    };
  }

  function drawCameraCanvasFrame() {
    const video = $('video');
    const canvas = $('camera_canvas');
    if (!video || !canvas) {
      state.cameraCanvasRunning = false;
      return;
    }

    resizeCameraCanvas();

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw > 0 && vh > 0 && canvas.width > 0 && canvas.height > 0) {
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        state.cameraCanvasFrame += 1;
        if (!state.activeVideoBounds || state.cameraCanvasFrame % 12 === 1) {
          const activeBounds = detectActiveVideoBounds(video);
          state.activeVideoBounds = activeBounds || { sx: 0, sy: 0, sw: vw, sh: vh };
        }
        const activeBounds = trimLandscapeSourceInPortrait(state.activeVideoBounds, video);
        const crop = getCoverCrop(activeBounds, canvas.width, canvas.height);

        try {
          ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
          canvas.classList.add('is-live');
        } catch (error) {
          canvas.classList.remove('is-live');
        }
      }
    } else {
      canvas.classList.remove('is-live');
    }

    requestAnimationFrame(drawCameraCanvasFrame);
  }

  function startCameraCanvasPreview() {
    if (state.cameraCanvasRunning) {
      return;
    }
    state.cameraCanvasRunning = true;
    drawCameraCanvasFrame();
  }

  function syncCameraStartButton() {
    const button = $('camera_start');
    const video = $('video');
    if (!button || !video || state.pendingFile) {
      return;
    }

    const live = videoLooksLive(video);
    resizeCameraCanvas();
    button.hidden = live;
    if (live) {
      startCameraCanvasPreview();
      if ($('status_panel').textContent === '点击画面开启摄像头。' || $('status_panel').textContent === '正在开启摄像头...') {
        setStatus(text.idle, false);
      }
      return;
    }

    if ($('receive_progress_panel').hidden) {
      setStatus('点击画面开启摄像头。', false);
    }
  }

  function tryStartCameraFromGesture() {
    const video = $('video');
    setStatus('正在开启摄像头...', false);

    if (window.ZheDianKuaiChuanStartCamera) {
      window.ZheDianKuaiChuanStartCamera(true);
    }
    if (video && video.play) {
      const playPromise = video.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function () {});
      }
    }

    setTimeout(syncCameraStartButton, 800);
  }

  function bindCameraStart() {
    const button = $('camera_start');
    const video = $('video');
    if (!button || !video) {
      return;
    }

    button.addEventListener('click', tryStartCameraFromGesture);
    video.addEventListener('loadedmetadata', resizeCameraCanvas);
    video.addEventListener('loadedmetadata', startCameraCanvasPreview);
    video.addEventListener('playing', syncCameraStartButton);
    video.addEventListener('playing', startCameraCanvasPreview);
    video.addEventListener('loadeddata', syncCameraStartButton);
    video.addEventListener('loadeddata', startCameraCanvasPreview);
    video.addEventListener('canplay', syncCameraStartButton);
    window.addEventListener('resize', resizeCameraCanvas);
    window.addEventListener('orientationchange', resizeCameraCanvas);

    setTimeout(syncCameraStartButton, 1800);
  }

  function showDeferredToast() {
    const message = sessionStorage.getItem('zdkc-toast');
    if (!message) {
      return;
    }
    sessionStorage.removeItem('zdkc-toast');
    showToast(message);
  }

  patchRecv();
  patchZstd();
  bindUi();
  bindCameraStart();
  setStatus(text.idle, false);
  showDeferredToast();

  window.ZheDianKuaiChuan = {
    updateProgress,
    showReceivedDialog,
    resetReceiver
  };
}());

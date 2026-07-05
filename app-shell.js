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
    usageBody: '1. 将摄像头对准发送端显示的动态码。\n2. 接收过程中保持手机稳定。\n3. 接收完成后选择保存到本地或转发到微信。',
    aboutTitle: '关于',
    aboutBody: '作者：吕知彼\n版本号：0.6.6-zd15d (42)\n页面版本：20260705-125217-smartcrop1\n安装包：ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk',
    saveLocal: '保存到本地',
    shareWechat: '转发到微信',
    close: '确定',
    reset: '重置',
    shareFallback: '当前浏览器不能直接转发，已改为保存到本地。'
  };

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

  function savePendingFile() {
    if (!state.pendingFile || !state.nativeDownload) {
      return;
    }
    state.nativeDownload(state.pendingFile.name, state.pendingFile.blob);
    setStatus(text.receivedStatus(state.pendingFile.name), true);
  }

  async function sharePendingFile() {
    if (!state.pendingFile) {
      return;
    }

    try {
      const file = new File([state.pendingFile.blob], state.pendingFile.name, {
        type: state.pendingFile.blob.type || 'application/octet-stream'
      });
      const payload = {
        files: [file],
        title: state.pendingFile.name,
        text: state.pendingFile.name
      };

      if (navigator.canShare && navigator.canShare(payload) && navigator.share) {
        await navigator.share(payload);
        setStatus(text.receivedStatus(state.pendingFile.name), true);
        return;
      }
    } catch (error) {
      console.warn('share failed', error);
    }

    savePendingFile();
    showToast(text.shareFallback);
  }

  function showReceivedDialog() {
    if (!state.pendingFile) {
      return;
    }

    openDialog(text.receivedTitle, state.pendingFile.name, [
      { label: text.saveLocal, handler: savePendingFile },
      { label: text.shareWechat, handler: sharePendingFile },
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
        const activeBounds = state.activeVideoBounds;
        const crop = getCoverCrop(activeBounds, canvas.width, canvas.height);

        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
      }
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

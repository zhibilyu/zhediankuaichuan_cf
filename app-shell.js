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
    aboutBody: '作者：吕知彼\n版本号：0.6.6-zd15d (42)\n安装包：ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk',
    saveLocal: '保存到本地',
    shareWechat: '转发到微信',
    close: '确定',
    reset: '重置',
    shareFallback: '当前浏览器不能直接转发，已改为保存到本地。'
  };

  const state = {
    pendingFile: null,
    nativeDownload: null,
    toastTimer: 0
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
  setStatus(text.idle, false);
  showDeferredToast();

  window.ZheDianKuaiChuan = {
    updateProgress,
    showReceivedDialog,
    resetReceiver
  };
}());

# Share To Other Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the received-file share action to “分享到其他应用” and ensure sharing never downloads a fallback copy.

**Architecture:** Keep the existing Web Share API flow in `app-shell.js`, but separate it completely from the independent download action. Extend the existing static validator to enforce the user-facing copy, absence of a download call inside `sharePendingFile()`, and consistent cache-busting versions.

**Tech Stack:** Static HTML, JavaScript, Web Share API, Service Worker Cache API, Node.js validation script, Android ADB and Chrome DevTools Protocol.

## Global Constraints

- The share button label is exactly `分享到其他应用`.
- Sharing passes the in-memory received file to the system share sheet and does not write a copy to Downloads.
- Unsupported or failed sharing only shows `当前浏览器不支持系统分享，请使用保存到本地。`.
- `保存到本地` remains the only action that downloads the file.
- The visible page version and every versioned shell asset use `20260727-061922-shareapps1`.
- The receive, decode, camera, and scan-frame behavior must remain unchanged.

---

## File Structure

- `app-shell.js`: Owns received-file dialog copy and the Web Share/download actions.
- `tools/validate-pages.mjs`: Enforces the new copy, share-only fallback, and version consistency.
- `index.html`: Loads the versioned shell assets and registers the versioned receiver service worker.
- `recv.html`: Mirrors the receiver entry page and its versioned assets.
- `recv.2026-05-09T0146.js`: Creates workers using the current page version.
- `recv-sw.js`: Caches versioned receiver assets.
- `sw.js`: Caches versioned root receiver assets.

### Task 1: Implement Share-Only Behavior

**Files:**
- Modify: `tools/validate-pages.mjs`
- Modify: `app-shell.js`
- Modify: `index.html`
- Modify: `recv.html`
- Modify: `recv.2026-05-09T0146.js`
- Modify: `recv-sw.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `state.pendingFile`, `navigator.canShare(payload)`, `navigator.share(payload)`, and `showToast(message)`.
- Produces: `sharePendingFile()` that opens the system share sheet when supported and never calls `savePendingFile()`.

- [ ] **Step 1: Write the failing validation**

In `tools/validate-pages.mjs`, change the version constant and add exact shell expectations:

```js
const pageVersion = '20260727-061922-shareapps1';

const jsExpectations = [
  `页面版本：${pageVersion}`,
  "usageBody: '1. 将摄像头对准发送端显示的动态码。\\n2. 接收过程中保持手机稳定。\\n3. 接收完成后选择保存到本地或分享到其他应用。'",
  "shareOtherApps: '分享到其他应用'",
  "shareFallback: '当前浏览器不支持系统分享，请使用保存到本地。'",
  '{ label: text.shareOtherApps, handler: sharePendingFile }',
];
```

After reading `app-shell.js`, isolate and validate the sharing function:

```js
const shareFunction = js.match(
  /async function sharePendingFile\(\) \{[\s\S]*?\n  \}\n\n  function showReceivedDialog/
);
if (!shareFunction) {
  errors.push('app-shell.js must define sharePendingFile before showReceivedDialog');
} else if (shareFunction[0].includes('savePendingFile()')) {
  errors.push('sharePendingFile must not download a fallback copy');
}
```

- [ ] **Step 2: Run validation and confirm the expected failure**

Run:

```powershell
npm.cmd run validate
```

Expected: exit code `1`, with failures for `20260727-061922-shareapps1`, `shareOtherApps`, the new usage/fallback copy, and the existing `savePendingFile()` call inside `sharePendingFile()`.

- [ ] **Step 3: Implement the minimal share-only behavior**

In `app-shell.js`, use:

```js
usageBody: '1. 将摄像头对准发送端显示的动态码。\n2. 接收过程中保持手机稳定。\n3. 接收完成后选择保存到本地或分享到其他应用。',
aboutBody: '作者：吕知彼\n版本号：0.6.6-zd15d (42)\n页面版本：20260727-061922-shareapps1\n安装包：ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk',
shareOtherApps: '分享到其他应用',
shareFallback: '当前浏览器不支持系统分享，请使用保存到本地。'
```

End `sharePendingFile()` with only:

```js
showToast(text.shareFallback);
```

Build the dialog action with:

```js
{ label: text.shareOtherApps, handler: sharePendingFile },
```

- [ ] **Step 4: Update all cache-busting references**

Replace `20260727-005450-anchorrepair2` with `20260727-061922-shareapps1` in:

```text
index.html
recv.html
recv.2026-05-09T0146.js
recv-sw.js
sw.js
```

Use these cache names:

```js
var _cacheName = 'zhediankuaichuan-recv-v0.6.6-zd15d-42-shareapps1';
var _cacheName = 'zhediankuaichuan-recv-root-v0.6.6-zd15d-42-shareapps1';
```

- [ ] **Step 5: Run automated verification**

Run:

```powershell
npm.cmd run validate
git diff --check
```

Expected: both commands exit `0`; validation prints `Cloudflare Pages validation passed for .`.

- [ ] **Step 6: Commit the implementation**

Run:

```powershell
git add -- app-shell.js index.html recv.html recv.2026-05-09T0146.js recv-sw.js sw.js tools/validate-pages.mjs
git commit -m "Share received files through system apps"
```

Expected: one implementation commit containing only the listed files.

### Task 2: Verify On Phone And Publish

**Files:**
- Verify: deployed `https://zdkc.pages.dev/`
- Verify: Android `/sdcard/Download`

**Interfaces:**
- Consumes: the received file already reconstructed by the decoder.
- Produces: a system application chooser without a new downloaded file.

- [ ] **Step 1: Verify the local phone UI**

Serve the repository on port `8801`, reverse it to the connected Android phone, reload with caches cleared, receive a test file, and inspect:

```js
({
  actions: [...document.querySelectorAll('#dialog_actions button')].map(button => button.textContent.trim()),
  pageVersion: document.querySelector('#dialog_body')?.textContent
})
```

Expected received-file actions:

```json
["保存到本地", "分享到其他应用", "重置"]
```

- [ ] **Step 2: Verify sharing does not download**

Record `/sdcard/Download` before clicking “分享到其他应用”, click the button through Chrome DevTools Protocol, confirm Android displays the system application chooser, cancel it, and compare the directory afterward.

Expected: no new file in `/sdcard/Download`; the webpage remains usable and the received file can be reopened from its status panel.

- [ ] **Step 3: Verify independent local saving**

Click “保存到本地” and inspect:

```powershell
adb shell "ls -l /sdcard/Download/aaa.ipynb"
```

Expected: `aaa.ipynb` exists with the original filename and nonzero size.

- [ ] **Step 4: Push both local commits**

Run:

```powershell
$env:GIT_SSH_COMMAND='ssh -i C:/Users/lvzhibi/.ssh/id_ed25519_zhediankuaichuan_cf -o IdentitiesOnly=yes'
git push origin master
```

Expected: GitHub `origin/master` advances through the design commit and implementation commit.

- [ ] **Step 5: Verify Cloudflare Pages deployment**

Poll `https://zdkc.pages.dev/` without cache until its HTML contains:

```text
20260727-061922-shareapps1
```

Then open the production URL on the connected phone, receive the test file, verify the three action labels, click “分享到其他应用”, and confirm the system application chooser opens without creating a download.

- [ ] **Step 6: Final repository verification**

Run:

```powershell
npm.cmd run validate
git status --porcelain
git rev-parse HEAD
git rev-parse origin/master
```

Expected: validation passes, the worktree is clean, and local `HEAD` equals `origin/master`.

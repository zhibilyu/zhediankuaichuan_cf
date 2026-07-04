# 浙电快传 Cloudflare Pages Receiver

This repository deploys a mobile-only Cloudflare Pages receiver for 浙电快传. The web UI mirrors the Android APK:

```text
ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk
```

The page keeps the libcimbar browser decoder/WASM runtime from the upstream receiver, but replaces the visible shell with the Android-style scanner interface: title, reset/usage/about buttons, centered camera scan area, receive progress panel, status panel, and save/share actions after a file is received.

The previous Cloudflare Pages decoder state is backed up as the Git tag:

```text
beifen_202607042120
```

## Cloudflare Pages Settings

For this standalone repository:

```text
Framework preset: None
Build command: npm run validate
Build output directory: .
```

If this directory is nested under another repository, set:

```text
Root directory: cloudflare
Build command: npm run validate
Build output directory: .
```

Cloudflare Pages must serve the site over HTTPS so the mobile browser can access the camera.

## Routes

- Mobile receiver root: `/`
- Receiver aliases: `/recv`, `/receive`, `/receiver`
- Legacy encoder aliases: `/send`, `/encoder` redirect back to `/`

## Source Runtime

- Web receiver runtime: `sz3/libcimbar` release `v0.6.5`, asset `cimbar.wasm.tar.gz`
- Runtime version marker: `2026-05-09T0146`
- Android UI reference: `ZheDianKuaiChuan-v0.6.6-zd15d-42-release.apk`

## Validation

Run this before deploying:

```bash
npm run validate
```

On Windows PowerShell, use:

```powershell
npm.cmd run validate
```

The validation script checks that local HTML, CSS, JavaScript, manifest, service worker, icon, and WASM references resolve, and that the root page is the mobile 浙电快传 receiver rather than the legacy Cimbar encoder/decoder page.

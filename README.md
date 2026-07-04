# libcimbar for Cloudflare Pages

This directory is a self-contained Cloudflare Pages deployment for the libcimbar web app.

It serves the browser encoder at `/` and the browser receiver at `/recv.html`.

## Contents

- Static runtime files are from the `sz3/libcimbar` GitHub release `v0.6.5`.
- Release asset: `cimbar.wasm.tar.gz`
- Release asset SHA-256: `639163eb6083235553f1a69f0ca45a1d43df37d5aca09ec5814fca806a0d9993`
- Icons are copied from the repository `web/` directory.
- `icon-512x512-maskable.png` is copied from `icon-512x512.png` to satisfy the receiver PWA manifest and service worker cache list.

## Cloudflare Pages Settings

Use this directory as the Pages project root:

```text
Root directory: cloudflare
Build command: npm run validate
Build output directory: .
```

If the Pages project root remains the repository root, use:

```text
Build command: cd cloudflare && npm run validate
Build output directory: cloudflare
```

## Routes

- Sender: `/`
- Sender alias: `/send`
- Receiver: `/recv.html`
- Receiver aliases: `/recv`, `/receive`, `/receiver`

The route aliases are configured in `_redirects`.

## Validation

Run this before deploying:

```bash
npm run validate
```

The validation script checks that local HTML, JavaScript, manifest, service worker, icon, and WASM references resolve inside this directory. It also checks that `_headers` serves WASM as `application/wasm`.

## Direct Deploy With Wrangler

```bash
npm run validate
npx wrangler pages deploy . --project-name libcimbar
```

## Notes

Deploy this site at the domain root. The service workers and PWA manifests use root-scoped paths.

Cloudflare Pages provides HTTPS by default, which is required for camera access on the receiver page.

# libcimbar Receiver for Cloudflare Pages

This repository deploys the libcimbar web decoder to Cloudflare Pages. It is intended to behave like `re.cimbar.org`, which redirects to the upstream receiver page at `https://cimbar.org/recv.html`.

The root route `/` serves the receiver UI directly.

## Source

- Receiver source: `sz3/libcimbar` release `v0.6.5`, asset `cimbar.wasm.tar.gz`
- Release asset SHA-256: `639163eb6083235553f1a69f0ca45a1d43df37d5aca09ec5814fca806a0d9993`
- Receiver entry copied to both `index.html` and `recv.html`
- Runtime version marker: `2026-05-09T0146`

The issue that motivated this deployment is:

```text
https://github.com/sz3/libcimbar/issues/170
```

That issue confirms the iPhone-compatible browser decoder is the receiver page, not the encoder page.

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

## Routes

- Decoder root: `/`
- Decoder aliases: `/recv`, `/receive`, `/receiver`
- Legacy encoder aliases: `/send`, `/encoder` redirect back to `/`

## Validation

Run this before deploying:

```bash
npm run validate
```

The validation script checks that:

- local HTML, JavaScript, manifest, service worker, icon, and WASM references resolve
- `_headers` serves WASM as `application/wasm`
- `index.html` is the decoder entry, not the encoder entry

## Direct Deploy With Wrangler

```bash
npm run validate
npx wrangler pages deploy . --project-name libcimbar
```

## Notes

Deploy this site at the domain root. The receiver uses root-scoped service workers and PWA manifests.

Cloudflare Pages provides HTTPS by default, which is required for browser camera access.

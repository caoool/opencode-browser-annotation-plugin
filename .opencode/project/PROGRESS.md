# Project Progress

- Updated: 2026-07-15T02:10:00Z
- Milestone: v0.6.2 shipped; Chrome Web Store submitted for review

## Completed

- Plugin (`src/plugin.ts`): loopback HTTP server (configurable host/port), active-session tracking, injection via OpenCode SDK. Typechecks and builds to `dist/`. Published to npm (currently 0.6.2 via CI trusted publishing).
- Chrome extension (MV3, `extension/`): element picker, onUI-style popup (Send + Add-to-list), dark floating sidebar, custom upward session dropdown/targeting, element thumbnails (local-only), status poll, keyboard containment, context-invalidation guard.
- Lean payload (0.6.x): `cleanText`, `safeOpenTag` (opening-tag-only; excludes class/style; omits bare `<tag>`; redacts secret-looking values by attr name and by input name/type). Guidance lives in the bundled `browser-annotation` skill (auto-loaded), not in each message.
- Icons (0.6.2): `extension/icons/icon.svg` -> 16/32/48/128 + 512 promo (dark badge, mint picker brackets, cursor). Wired into manifest (`icons` + `action.default_icon`).
- Web Store packaging: `scripts/pack-extension.mjs` + `npm run pack:ext` -> `dist/extension.zip` (manifest at zip root, deterministic, zero-dep; CRC-validated).
- Store listing kit: `STORE.md` (description, permission justifications, privacy disclosures, single purpose).
- Screenshots: 3x 1280x800 in `store/screenshots/` (also `docs/img/`), captured by driving the REAL `overlay.js` against a demo dashboard via a `chrome.*` shim in headless Chrome hitting the live plugin.
- Landing page: `docs/index.html` + `docs/privacy.html`, served by GitHub Pages (main `/docs`, `.nojekyll`). Live at https://caoool.github.io/opencode-browser-annotation-plugin/ . Google Search Console meta tag added to `<head>`.
- CI + Publish workflows (npm trusted publishing via OIDC on release; Node 24 + npm@11).

## Active

- Chrome Web Store review in progress (submitted 2026-07-15). Awaiting Google verdict (email).

## Blocked

- None.

## Next

- If review requests changes: adjust (likely permission-justification wording) and resubmit.
- Optional/non-blocking: finish Search Console Verify, then set the Web Store "Official URL" from the dropdown (same Google account as the dev dashboard).
- Optional: promo tiles (440x280, 1400x560) for featured placement.

## Verification State

- Plugin typecheck + build: passed. npm shows 0.6.2.
- `dist/extension.zip`: python `zipfile.testzip()` OK, manifest.json at root, version 0.6.2.
- Landing page + privacy page: HTTP 200 live on Pages; no broken images; no mobile overflow (checked 390px + 1280px).
- Secret redaction: verified `authenticity_token` hidden input value -> `[redacted]`.

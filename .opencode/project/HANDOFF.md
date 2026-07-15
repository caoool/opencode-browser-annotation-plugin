# Project Handoff

- Updated: 2026-07-15T02:10:00Z
- Branch: `main`
- Session focus: extension icons, Chrome Web Store packaging + submission, GitHub Pages landing + privacy pages.

## Current Objective

Chrome Web Store review is in progress (submitted 2026-07-15). Handle any Google
change-requests; optionally finish Search Console verification to set the Official URL.

## Completed (this session)

- Payload polish (0.6.1): `safeOpenTag` drops class/style + omits bare `<tag>`; secret redaction widened to input name/type (verified `authenticity_token` -> `[redacted]`).
- Icons (0.6.2): `extension/icons/icon.svg` -> 16/32/48/128 + 512; wired into manifest.
- Packaging: `scripts/pack-extension.mjs` + `npm run pack:ext` -> `dist/extension.zip` (manifest at root, CRC-validated).
- Store kit `STORE.md`; 3x 1280x800 screenshots (`store/screenshots/`, `docs/img/`) captured by driving the REAL overlay via a `chrome.*` shim against the live plugin.
- Landing + privacy pages in `docs/` on GitHub Pages (main `/docs`); live + 200. Search Console meta tag in `<head>`.
- Submitted to the Chrome Web Store.

## Current Changes

- All committed and pushed to `main`. npm at 0.6.2 (CI trusted publishing). `dist/` gitignored (build the zip with `npm run pack:ext`).

## Decisions and Findings

- See DEC-001..DEC-008 and FND-001..FND-005.
- New: DEC-007 (ship to Chrome Web Store; zip via allowlist, manifest at root), DEC-008 (landing + privacy on GitHub Pages; Search Console URL-prefix + meta-tag verification because `github.io` domain-property DNS verification is impossible).

## Blockers and Risks

- Web Store review outcome unknown; permission-justification wording is the usual rejection cause (copy lives in `STORE.md`).
- Search Console "Official URL" requires the SAME Google account as the dev dashboard.
- Screenshots use a generic "Acme" demo app, not the user's real app.

## Exact Next Actions

1. On Google verdict: if changes requested, fix (likely justifications in `STORE.md`) and resubmit.
2. Optional: click Verify in Search Console (meta tag live), then set Web Store Official URL from the dropdown.
3. Optional: generate promo tiles (440x280, 1400x560).
4. To rebuild the upload zip after any extension change: bump versions (package.json + manifest.json), `npm run pack:ext`, and release for npm.

## Web Store asset locations

- Upload zip: `npm run pack:ext` -> `dist/extension.zip`
- Store icon/promo: `extension/icons/icon-128.png`, `icon-512.png`
- Screenshots: `store/screenshots/*.png`
- Listing copy + justifications: `STORE.md`
- Homepage/Privacy URLs: https://caoool.github.io/opencode-browser-annotation-plugin/ and `/privacy.html`

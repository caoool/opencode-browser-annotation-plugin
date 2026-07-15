# Project Progress

- Updated: 2026-07-15T04:00:00Z
- Milestone: v0.1 build

## Completed

- Plugin (`src/plugin.ts`): loopback HTTP server (configurable host/port), active-session tracking via the `chat.message` hook, injection via `client.session.promptAsync`. Typechecks and builds to `dist/`.
- Verified end-to-end in a live `opencode serve`: POST to `/annotations` injected a new user turn and the agent responded to the instruction + element metadata. `/status` returns health JSON.
- Chrome extension (MV3, `extension/`): element picker content script, background store + batch submit, popup (list/select/submit/clear), options page (endpoint config).
- README with plugin + extension install and the `ssh -R` tunnel workflow.
- CI (`.github/workflows/ci.yml`: typecheck + build) and Publish (`publish.yml`: npm trusted publishing via OIDC on release).

## Active

- Local install for the user; live browser test through the tunnel.

## Blocked

- None.

## Next

- Configure npm trusted publishing for the package on npmjs.com (repo + workflow).
- User loads the unpacked extension and tests the full loop over the tunnel.

## Verification State

- Plugin typecheck + build: passed.
- End-to-end injection in `opencode serve`: passed (agent received and acted on the annotation).
- `npm pack --dry-run`: ships `dist/` + `extension/` + README.
- Extension JS syntax + manifest JSON: passed. Live in-browser test: pending user.

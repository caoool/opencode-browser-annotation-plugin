# Project Memory

Durable, verified knowledge for the browser-annotation plugin.

## Architecture and Constraints

- OpenCode runs on a headless host reached over SSH from the user's desktop; the browser (extension) runs on the desktop. A browser on the host is never user-visible.
- Transport: plugin HTTP server binds `127.0.0.1` on the host; extension POSTs over an `ssh -R` reverse tunnel. Never bind a public/LAN interface. Host/port configurable for same-localhost users.
- Scope is gap 1 only: instruction + element metadata. No screenshots, no vision. Source: CHARTER, DEC-002; verified 2026-07-14.
- Agent wake is via `client.session.prompt` injection into the active session. Source: FND-005; verified 2026-07-14.

## Environment Facts

- Vision works on the CPA proxy with `gpt-5.6-sol` via direct `image_url`; `claude-opus-4-8` image route 502s; OpenCode's own file-part path yields `NO_IMAGE`. Kept for reference only, since vision is out of scope. Source: FND-002..FND-004; verified 2026-07-14.

## Publishing

- Published to npm as `opencode-browser-annotation-plugin` (first version 0.1.0, 2026-07-15).
- npm TRUSTED PUBLISHING is configured for this repo (set up by the user 2026-07-15). Publishing is done by CI via `.github/workflows/publish.yml`, which runs on a published GitHub release and uses OIDC (`id-token: write`, `npm publish --provenance`). No passkey or token is needed for CI publishes. This is the primary publish path.
- To release a new version: bump `package.json` (`npm version patch|minor|major`), push, then create a GitHub release whose tag matches (`gh release create vX.Y.Z --target main --generate-notes`). The workflow publishes automatically. The agent CAN create the release with `gh`; verify the run with `gh run watch`.
- Publish workflow requires Node 24 + `npm install -g npm@11` (trusted publishing needs npm >= 11.5.1, and npm@latest/@12 needs Node >= 22, so Node 20 fails with EBADENGINE). Verified: v0.1.1 published via CI trusted publishing with provenance on 2026-07-15. If a release re-run is needed after fixing the workflow, delete + recreate the release/tag so it runs against updated main (`gh release delete vX.Y.Z --cleanup-tag`).
- The user's npm account uses a passkey (WebAuthn), so manual `npm publish` cannot be completed from the headless server — it needs the user's desktop. Prefer the CI/trusted-publishing path above instead of manual publish.

## Runtime notes

- OpenCode runs plugins under a bundled Bun runtime (no system `bun`). Its `node:http` compat layer does NOT reliably flush `res.writeHead(status, headers)`; that produced empty replies / http=000 on the plugin server (v0.1.0 bug). Fix: use `res.setHeader(...)` + `res.statusCode = ...` + `res.end(...)` separately (v0.1.1). Verified in a live `opencode serve` on the Bun runtime. Source: tested; verified 2026-07-15.
- The plugin server initializes lazily on the first session; `/status` shows `activeSession:false` until a message is sent (the `chat.message` hook sets the id).

## Conventions

- Never auto-commit; the user commits.
- Desktop setup hints must include BOTH the plugin reverse tunnel and the 9333 desktop-drive port.

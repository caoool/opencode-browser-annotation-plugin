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
- The user's npm account uses a passkey (WebAuthn), which cannot be completed from the headless server. The user must publish from their own desktop machine where the passkey lives. Give this exact command sequence when a publish is needed (bump the version in `package.json` first for a new release):

  ```
  git clone https://github.com/caoool/opencode-browser-annotation-plugin.git
  cd opencode-browser-annotation-plugin
  npm install
  npm publish --access public
  ```

  `prepublishOnly` builds `dist/` automatically. `npm publish` opens the browser passkey prompt. For an update, run `npm version patch|minor|major` (or edit `package.json`) before `npm publish`. Alternatively use CI trusted publishing via `.github/workflows/publish.yml` on a GitHub release (OIDC, no passkey).

## Conventions

- Never auto-commit; the user commits.
- Desktop setup hints must include BOTH the plugin reverse tunnel and the 9333 desktop-drive port.

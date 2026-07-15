# Project Handoff

- Updated: 2026-07-15T04:00:00Z
- Branch: `main`
- Session focus: built and verified the v0.1 plugin + extension.

## Current Objective

Local install for the user + a live in-browser test over the tunnel; then set up
npm trusted publishing and cut a release.

## Completed

- Grilling session (2026-07-14) locked scope and architecture; see DECISIONS and FINDINGS.
- Built the plugin (`src/plugin.ts`) and verified injection end-to-end in a live `opencode serve` — the agent received and acted on an annotation.
- Switched injection to `client.session.promptAsync` so the extension gets a fast ack.
- Built the MV3 Chrome extension (`extension/`), README, CI + publish workflows.

## Current Changes

- Source, extension, README, workflows added. `dist/` is built locally (gitignored).

## Decisions and Findings

- See DEC-001..DEC-006 and FND-001..FND-005.
- Headline: build fresh; gap 1 only (no vision); loopback + ssh -R; inject via `client.session.prompt`; extension in the debug Chrome profile; publish to npm with CI.

## Blockers and Risks

- Active-session id discovery for injection.
- Element-metadata sufficiency without a screenshot (ambiguous "this element").
- npm trusted-publishing + unpacked-extension update flow.
- Versioned extension↔plugin payload schema.

## Exact Next Actions

1. Scaffold repo: plugin package (`@opencode-ai/plugin`), extension source, `package.json`, CI, trusted publishing.
2. Build plugin HTTP server (127.0.0.1) + extension (select element, list, Submit → POST).
3. Inject a turn via `client.session.prompt`; resolve active session id.
4. Desktop hints: include BOTH the plugin reverse tunnel and the 9333 desktop-drive port.
5. Local install for the user; then harden + publish.

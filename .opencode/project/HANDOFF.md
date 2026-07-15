# Project Handoff

- Updated: 2026-07-15T03:31:36Z
- Branch: `main` (empty repo; only project state committed)
- Session focus: planning complete via grilling; ready to scaffold code.

## Current Objective

Scaffold the plugin package + CI/trusted-publishing skeleton, then build the
extension + plugin loop for gap 1 (instruction + element metadata → agent).

## Completed

- Grilling session (2026-07-14) locked scope and architecture; see DECISIONS and FINDINGS.
- Verified plugin injection path, transport choice, and the vision situation (dropped).

## Current Changes

- Only `.opencode/project/` state exists; no source code yet.

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

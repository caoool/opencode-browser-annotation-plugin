# Decisions

Material decisions with rationale and supersession history. Grilled 2026-07-14.

### DEC-001 — Build fresh, learn from the reference

- Status: active
- Decision: build a new plugin + extension; study `JodusNodus/opencode-chrome-annotation` for approach but do not trust or reuse its code.
- Rationale: the reference solves the same problem but its code quality is unknown; a clean build fits the specific headless-server + SSH constraints.
- Evidence: reference README + `src/plugin.ts` reviewed 2026-07-14.
- Consequences: re-implement transport, element capture, and session injection.

### DEC-002 — Scope is gap 1 only; drop vision/screenshots

- Status: active
- Decision: v1 delivers a typed instruction + selected-element metadata to the agent. No screenshots, no image/vision transport.
- Rationale: vision is technically possible on the stack but the OpenCode file-part serialization path is unreliable; the user chose to drop it rather than fight it.
- Evidence: FND-002, FND-003, FND-004.
- Consequences: agent reasons from element metadata (selector/tag/text/role/aria/bounds/DOM context), not pixels.
- Supersedes: an earlier "gap-2 vision mandatory" stance (withdrawn by user 2026-07-14).

### DEC-003 — Transport: loopback HTTP + ssh -R reverse tunnel

- Status: active
- Decision: the plugin runs an HTTP server on the OpenCode host bound to `127.0.0.1`; the extension POSTs to it over an `ssh -R` reverse tunnel.
- Rationale: the host is SSH-only/behind NAT in the common case; the tunnel gives SSH-key-grade auth and encryption with no managed token, and keeps the port off any public/LAN interface. CDP-push is really polling and cannot wake the agent.
- Evidence: FND-001; CDP transport review 2026-07-14.
- Consequences: the user runs a second reverse tunnel; desktop hints must include both this port and the 9333 desktop-drive port. Host/port should be configurable for same-localhost users.

### DEC-004 — Wake via client.session.prompt injection

- Status: active
- Decision: on Submit, the plugin injects a new user turn into the active OpenCode session via `client.session.prompt`.
- Rationale: proven mechanism (reference project + OpenCode SDK) that makes the agent respond to the submission.
- Evidence: FND-005.
- Consequences: must resolve the correct active session id; batch multiple annotations per submit.

### DEC-005 — Extension runs in the dedicated debug Chrome profile

- Status: active
- Decision: target the throwaway debug Chrome profile used by desktop-drive (port 9333), not the user's main browser.
- Rationale: keeps agent-controlled browsing isolated from the user's real profile.
- Consequences: the user loads/updates an unpacked extension in that profile.

### DEC-006 — Publish as npm package with CI + trusted publishing

- Status: active
- Decision: publish to npm from `caoool/opencode-browser-annotation-plugin` with CI and OIDC trusted publishing.
- Rationale: distributable, versioned, matches the user's other plugins.
- Consequences: packaging/semver/provenance work; extension load/update flow to document.

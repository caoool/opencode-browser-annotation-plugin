# Findings

Verified discoveries from spikes. Grilled/tested 2026-07-14.

### FND-001 — CDP "push" is really polling; a plugin HTTP server is needed

- Status: verified
- Evidence: the `chrome-devtools` CLI/MCP exposes no `Runtime.bindingCalled` listener; page→client push would require polling `evaluate_script`. CDP transport docs reviewed.
- Impact: a dedicated plugin HTTP server (PUSH) is required for real-time submit and to wake the agent; adopted in DEC-003.

### FND-002 — Vision is available on the CPA proxy (direct)

- Status: verified
- Evidence: a direct call to `$CPA_BASE_URL/v1/chat/completions` with model `gpt-5.6-sol` and an OpenAI-style `image_url` (data URL) read a pixel-only secret correctly. Requires `curl -k` (self-signed cert; env sets `NODE_TLS_REJECT_UNAUTHORIZED=0`).
- Impact: vision is not blocked at the proxy/model layer; gap 2 was possible but dropped by choice (DEC-002).

### FND-003 — claude-opus-4-8 image route 502s on the proxy

- Status: verified
- Evidence: text request to `claude-opus-4-8` returns 200 "OK"; the same model with an image returns `502 unknown provider for model`.
- Impact: that specific model is unusable for images on this proxy; any future vision work must pin a vision-working model (e.g. `gpt-5.6-sol`).

### FND-004 — OpenCode file-part → provider serialization drops the image

- Status: verified
- Evidence: via a local `opencode serve`, a `session.prompt` with a `type:"file"` image part (data URL) is accepted and stored on the user message, but the model replies `NO_IMAGE` — even `gpt-5.6-sol`, which sees the same image on a direct call. Provider config differs: `cpa-van-base` base uses `@ai-sdk/openai-compatible` while `gpt-5.6-sol` overrides to `@ai-sdk/openai`.
- Impact: inline vision through OpenCode needs a serialization fix (data-URL vs http `image_url`, adapter mismatch). Root cause of dropping gap 2 rather than the proxy/model.

### FND-005 — OpenCode plugin API supports injection and custom tools

- Status: verified
- Evidence: plugin ctx exposes `{ project, directory, worktree, client, $ }`; `client.session.prompt({ path:{id}, body:{ parts } })` injects a turn; `tool: { name: tool({...}) }` adds agent-callable tools; rich event hooks exist (session.*, message.*, tui.prompt.append). Source: opencode.ai/docs/plugins and /docs/sdk.
- Impact: DEC-004 injection path is sound; a pull-tool fallback is available if live injection is unreliable.

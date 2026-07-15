# opencode-browser-annotation-plugin

Select an element in your browser, type an instruction, and send it — with the
element's metadata — to your [OpenCode](https://opencode.ai) agent's active
session. Built for a headless-server + remote-desktop setup: the agent runs on a
server you reach over SSH, and the browser runs on your desktop.

Text and element metadata only. **No screenshots, no vision.** The agent locates
the code from the selector/DOM context you send.

## How it works

```
Desktop Chrome (extension)
  └─ pick element + type instruction → list → [Submit]
       └─ POST http://127.0.0.1:39517/annotations   (via ssh -R when remote)
OpenCode host (plugin)
  └─ HTTP server on 127.0.0.1 → injects a turn into the active session
       └─ agent receives the instruction + element metadata and acts
```

The plugin binds to `127.0.0.1` only. When OpenCode is on a remote host, an
`ssh -R` reverse tunnel carries the extension's POST to it — no public port, and
SSH provides the auth and encryption.

## Install

### 1. Plugin (on the OpenCode host)

Add to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["opencode-browser-annotation-plugin"]
}
```

Restart OpenCode. The plugin starts an HTTP server on `127.0.0.1:39517`.
Configure with environment variables if needed:

- `OPENCODE_ANNOTATION_PORT` (default `39517`)
- `OPENCODE_ANNOTATION_HOST` (default `127.0.0.1`)

### 2. Extension (in your desktop Chrome)

Until it is on the Chrome Web Store, load it unpacked:

1. Get the `extension/` directory from this package (`node_modules/opencode-browser-annotation-plugin/extension`, or clone this repo).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `extension/`.
3. Use a dedicated Chrome profile — the same debug profile you drive with the agent is a good choice.

### 3. Tunnel (when OpenCode is remote)

On your desktop, forward the plugin port to the server (separate window):

```bash
ssh -N -R 39517:127.0.0.1:39517 you@server
```

If you also drive the browser from the agent (desktop-drive), forward both:

```bash
ssh -N -R 9333:127.0.0.1:9333 -R 39517:127.0.0.1:39517 you@server
```

If OpenCode runs on the same machine as your browser, no tunnel is needed — the
default `http://127.0.0.1:39517` already works. Set a custom endpoint in the
extension's **Settings** page.

## Use

1. Send at least one message in OpenCode so the plugin knows the active session.
2. Click the extension icon → **Select element**.
3. Hover to highlight, click the element, type your instruction (Esc cancels).
4. Repeat to queue more, then **Submit to agent**.
5. The agent receives the annotations as a new turn and responds.

## Payload

The extension POSTs to `/annotations`:

```json
{
  "extensionVersion": "0.1.0",
  "annotations": [
    {
      "instruction": "Make this button larger and blue",
      "page": { "url": "https://example.com/app", "title": "My App" },
      "element": {
        "selector": "button.cta",
        "tag": "BUTTON",
        "text": "Sign up",
        "role": "button",
        "ariaLabel": "Sign up",
        "bounds": { "x": 100, "y": 200, "width": 120, "height": 40 },
        "html": "<button class=\"cta\">Sign up</button>"
      }
    }
  ]
}
```

`GET /status` returns `{ ok, activeSession, host, port }` for a quick health check.

## Develop

```bash
npm install
npm run typecheck
npm run build      # emits dist/plugin.js
```

The plugin source is `src/plugin.ts`; the extension is plain MV3 in `extension/`.

## Limits

- Text + element metadata only; no screenshot is sent or seen by the model.
- The plugin injects into the most recently active session (tracked via the
  `chat.message` hook). Send a message first so a session is active.

## License

MIT

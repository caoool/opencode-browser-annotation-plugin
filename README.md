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
  └─ Alt+A → overlay + sidebar → pick element, type instruction, Act/Queue → [Submit]
       └─ POST http://127.0.0.1:39517/annotations   (via ssh -L when remote)
OpenCode host (plugin)
  └─ HTTP server on 127.0.0.1 → injects a turn into the active session
       └─ agent receives the instruction + element metadata and acts
```

The plugin binds to `127.0.0.1` only. When OpenCode is on a remote host, an
`ssh -L` local forward carries the extension's POST from your desktop to it — no
public port, and SSH provides the auth and encryption.

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

The extension (on your desktop) needs to reach the plugin server (on the host),
so use a **local forward**. Run on your desktop, in a separate window:

```bash
ssh -N -L 39517:127.0.0.1:39517 you@host
```

If you also drive the browser from the agent (desktop-drive on 9333), that is the
opposite direction (host → desktop), so it uses a reverse forward. You can run
both at once:

```bash
ssh -N -L 39517:127.0.0.1:39517 -R 9333:127.0.0.1:9333 you@host
```

If OpenCode runs on the same machine as your browser, no tunnel is needed — the
default `http://127.0.0.1:39517` already works. Set a custom endpoint in the
extension's **Settings** page.

## Use

1. Send at least one message in OpenCode so the plugin knows the active session.
2. Press **Alt+A** on any page, then click an element (highlight follows the
   cursor; works inside shadow DOM). A popup opens next to it.
3. In the popup, type an instruction and choose **Act now** (agent responds
   immediately) or **Queue** (held for context until the next Act). Then either:
   - **Send** (or Cmd/Ctrl+Enter) — submit this one right away, no sidebar needed.
   - **Add to list** — stash it in the sidebar to batch with others.
4. Press **Alt+Shift+A** (or click the toolbar icon) to open the **list sidebar**,
   review pending annotations, and **Submit** them together. The footer shows the
   connection status; a toast confirms how many were sent vs queued.

Shortcuts: `Alt+A` picks an element, `Alt+Shift+A` toggles the list. If they do
nothing after loading an unpacked build, set them at `chrome://extensions/shortcuts`.

## Payload

The extension POSTs to `/annotations`:

```json
{
  "extensionVersion": "0.2.0",
  "annotations": [
    {
      "mode": "act",
      "instruction": "Make this button larger and blue",
      "page": { "url": "https://example.com/app", "title": "My App" },
      "element": {
        "selector": "button.cta",
        "tag": "BUTTON",
        "id": "signup",
        "testId": "signup-cta",
        "role": "button",
        "ariaLabel": "Sign up",
        "classes": ["cta", "primary"],
        "text": "Sign up",
        "bounds": { "x": 100, "y": 200, "width": 120, "height": 40 },
        "inShadow": false,
        "html": "<button class=\"cta\">Sign up</button>"
      }
    }
  ]
}
```

`mode` is `"act"` (respond now, flushing any queued) or `"queue"` (hold for
context until the next act). The plugin surfaces the most code-locatable
identifiers first (testId, id, name, role) and treats the CSS path and bounds as
weak hints.

`GET /status` returns `{ ok, activeSession, sessionID, sessionTitle, queued, host, port }`
for a quick health check and to show the target session.

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

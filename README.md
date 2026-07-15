# opencode-browser-annotation-plugin

An OpenCode plugin + browser extension to visually select an element in a page,
type an instruction, and send it (with the element's metadata) back to the
agent's active OpenCode session — for a headless-server + remote-desktop setup.

> Status: planning. See `.opencode/project/` for the charter, decisions, and
> findings from the design grilling. Code scaffolding is next.

## Scope (v1)

- Select an element in the browser, type an instruction, submit.
- The agent receives a turn describing the instruction + element metadata
  (selector, tag, text, role, aria, bounds, DOM context).
- No screenshots / no vision (explicitly out of scope for v1).

## Architecture (planned)

- Plugin runs an HTTP server on the OpenCode host, bound to `127.0.0.1`.
- The extension (in a dedicated debug Chrome profile on the desktop) POSTs
  annotations over an `ssh -R` reverse tunnel.
- On submit, the plugin injects a turn via `client.session.prompt`.

## License

MIT

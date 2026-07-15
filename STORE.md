# Chrome Web Store — Listing Kit

Everything needed to submit `dist/extension.zip` to the Chrome Web Store.
Copy/paste the fields below into the Developer Dashboard.

## Upload
- Package: `dist/extension.zip` (manifest at zip root; rebuild with `npm run pack:ext`)
- Store icon (128): `extension/icons/icon-128.png` (already in manifest)
- Promo / high-res icon (512): `extension/icons/icon-512.png`

---

## Item name
OpenCode Browser Annotation

## Summary (≤132 chars)
Point at any element on a page and send its context to your OpenCode agent. Alt+A to pick, Alt+Shift+A for the list.

## Category
Developer Tools

## Language
English

---

## Description
Annotate the web the way you talk to your coding agent.

OpenCode Browser Annotation lets you point at any element on a page, type an
instruction ("make this button bigger", "this text is wrong"), and send it —
together with rich, structured context about that element — straight to your
OpenCode agent.

No more describing "the third card on the pricing section." The agent gets the
exact element: its tag, id, test-id, classes, ARIA role, text, CSS selector,
ancestor chain, nearest landmark/region, and — on React/Preact/Vue apps — the
framework component path. That's what makes the agent able to actually find the
code behind what you clicked.

HOW IT WORKS
• Alt+A — pick an element. Hover to highlight, click to select, type your note.
• Alt+Shift+A (or click the toolbar icon) — open the annotation list to batch
  several notes and send them together.
• Cmd/Ctrl+Enter — send. Target a specific agent session from the dropdown.

PRIVACY-FIRST BY DESIGN
• The extension talks ONLY to your own local OpenCode endpoint
  (http://127.0.0.1:39517). Nothing is sent to us or any third party.
• Only text and element metadata are sent — never screenshots. The small
  thumbnail you see in the sidebar is generated locally and stripped before
  submit.
• Secret-looking values (CSRF tokens, passwords, auth fields) are redacted from
  the captured markup before anything leaves the page.

REQUIREMENTS
This is the browser half of the OpenCode Browser Annotation plugin. You need the
OpenCode plugin running locally (npm: opencode-browser-annotation-plugin), which
exposes the localhost endpoint the extension posts to.

Open source: https://github.com/caoool/opencode-browser-annotation-plugin

---

## Permission justifications (paste into the matching dashboard fields)

### activeTab
Used only when you invoke the extension (Alt+A, Alt+Shift+A, or the toolbar
button) to run the annotation overlay on the tab you are currently looking at.
No background or automatic access to tabs.

### scripting
Injects the annotation overlay (element picker + sidebar UI) into the current
tab on demand when you trigger the extension. Required to highlight elements and
read the selected element's metadata.

### storage
Persists a single user setting locally: the OpenCode endpoint URL (defaults to
http://127.0.0.1:39517). No personal data is stored.

### host_permissions: http://127.0.0.1/* and http://localhost/*
The extension sends annotations to the user's own locally-running OpenCode
plugin over loopback. These hosts are required to reach that local endpoint.
No remote hosts are contacted.

### Remote code
None. All JavaScript is bundled in the package. No remote/eval'd code.

---

## Data usage disclosures (Privacy tab)
- Does the item collect user data? **No data is collected or transmitted to the
  developer or any third party.**
- All annotation data is sent solely to the user's own localhost endpoint.
- Not sold to third parties. Not used for anything unrelated to the single
  purpose. Not used for creditworthiness/lending.

## Single purpose (required field)
Let a developer select a DOM element on a page and send that element's context
and a text instruction to their locally-running OpenCode coding agent.

---

## Screenshots still needed (you provide — 1280×800 or 640×400 PNG/JPEG, ≥1)
Suggested shots:
1. Element hovered with the mint highlight + selection brackets.
2. The annotation popup open with an instruction typed in.
3. The dark sidebar list with several annotations + the session dropdown.
Capture these on a real app (ideally your own) at 1280×800.

## Optional promo tiles (only if you want featured placement)
- Small promo tile: 440×280
- Marquee: 1400×560

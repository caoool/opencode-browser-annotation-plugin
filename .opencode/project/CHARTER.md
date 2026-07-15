# Project Charter

Protected intent. Change goals, hard constraints, non-goals, or success criteria
only on explicit user direction.

## Goal

An OpenCode plugin plus a browser extension that let a user visually select an
element in a page and send a typed instruction, with the element's metadata, back
to the agent's active OpenCode session — closing the "click-to-annotate → code"
gap for a headless-server + remote-desktop setup.

## Success

- User selects an element in their desktop Chrome, types an instruction, submits,
  and the agent receives a turn describing the instruction and the element.
- Works across the SSH boundary (OpenCode on a headless host; browser on the
  user's desktop) without exposing any port publicly.
- Publishable as an npm package with CI and trusted publishing.

## Hard constraints

- Plugin HTTP server binds `127.0.0.1` only; the extension reaches it over an
  `ssh -R` reverse tunnel. No direct public/LAN binding.
- No screenshots and no image/vision handling anywhere (explicitly out of scope).
- Do not expose or require managed secrets for transport; rely on SSH.

## Non-goals

- Visual/vision features: the agent seeing screenshots as images (dropped).
- Running the browser on the server; the extension runs in the user's desktop
  Chrome (dedicated debug profile).
- Replacing the `browser-remote` desktop-drive workflow; this complements it.

## Primary failure to avoid

- Reinventing transport/injection poorly, or shipping something that only works
  when browser and OpenCode share one machine.

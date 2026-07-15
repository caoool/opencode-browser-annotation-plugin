---
name: browser-annotation
description: >-
  Interpret and act on browser annotations sent by the
  opencode-browser-annotation extension. Load this whenever a message says it is
  a "Browser annotation" or references the `browser-annotation` skill, or when a
  turn contains a "Selected element:" block with fields like data-testid,
  ancestors, nearest region, or a component path. It explains how to turn that
  element metadata into the correct code location and change.
---

# Browser annotations

Messages from the `opencode-browser-annotation` extension describe a DOM element
the user selected in their browser plus an instruction. Your job is to map that
element to the right code and carry out the instruction. The payload is text and
element metadata only — no screenshot is attached.

## How to locate the code

Use the most stable identifier available, in this order:

1. **Framework component path** (e.g. `App > Dashboard > SignupCard`) — the
   strongest hint. Find that component's source file first.
2. **`data-testid` / `id` / `name` / `role`** on the element itself — usually
   maps directly to source.
3. **Ancestors (nearest first) + nearest region** — use these to disambiguate a
   generic element (e.g. a bare `<button>` that appears many times). They tell
   you which container/feature/file the element belongs to.
4. **Unique class or text** — human-authored class names and the element's text
   are good locators. Build-generated/hashed class names are already filtered
   out; treat any remaining opaque tokens as weak.
5. **CSS path and viewport bounds** — weak hints only; do not rely on them.

## Rules

- Confirm the element actually exists in this codebase before editing. If you
  cannot find it, say so instead of guessing or inventing a file.
- Reason from the metadata and the actual code; there is no image.
- The `opening tag` field is the element's own opening tag with secret-looking
  attribute values redacted — do not expect a full HTML subtree, and never try
  to recover redacted values.
- If several annotations arrive together, address each one.
- Treat the page URL as context for which route/screen the user was on.

## Field reference

- `Element` — tag name.
- `data-testid`, `id`, `name`, `role`, `aria-label` — element identifiers.
- `classes` — authored class names (hashed/build-generated ones removed).
- `text` — the element's visible text (whitespace-collapsed, truncated).
- `href` / `src` — link or media source when present.
- `<framework> components` — component hierarchy from React/Preact/Vue when
  detectable.
- `nearest region` — closest semantic landmark/region ancestor.
- `ancestors (nearest first)` — parent chain signatures, shadow DOM pierced.
- `css path` — a positional selector; weak.
- `context` — notes such as "inside a shadow DOM" or "inside an iframe".
- `viewport bounds` — on-screen size/position; weak.
- `opening tag` — redacted opening tag of the element.

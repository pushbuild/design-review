---
name: ui-audit
description: Find layout bugs in a web page or web app by sweeping it across 13 viewport widths (320–1920 px) and testing every element in code. It catches horizontal overflow, elements running off the viewport, clipped, spilling, overlapping or invisible text, required elements hidden or covered, content hidden in sideways scrollers, tiny tap targets and text on phones, and stretched images. Use before shipping or showing any web UI, after a CSS change, when asked to "check responsive", "test on mobile", "does it break at any width", "layout bug", "overflow", "text cut off" or "QA the page", or as the first step of design-review.
---

# ui-audit

Code, not eyes: it finds the bug and names the element, so you fix the CSS rule instead of squinting at screenshots.

## Run it
Everything runs in one pinned Docker image, `ghcr.io/pushbuild/design-review:1.1.8` (headless Chromium + Playwright). Run from the folder that holds the page and where the output should go; that folder is mounted at the same path inside the container:
```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" \
  ghcr.io/pushbuild/design-review:1.1.8 ui-audit <url | ./page.html> ./audit/page \
  [--expect "nav .cart"] [--expect "#buy"] [--widths 320,768,1440] [--dark] [--shots] [--text-scale 1.3]
```
- **Speed and requirements:** about 10–30 s for 13 widths. It needs Docker only; nothing installs on the host. The first run pulls the image once.
- **Paths:** the page and the output prefix must be inside the current folder (relative paths are fine). For a page in another folder, add `-v /that/folder:/that/folder:ro` and pass its absolute path.
- **Dev servers:** for `http://localhost:<port>` (or `127.0.0.1`), add `--network host` so the container can reach it. Use the default network for everything else: on the host network Chromium drops requests (`net::ERR_NETWORK_CHANGED`) and pages load without CSS.
- **Output:** one line per problem element, with the widths where it happens, plus `<prefix>-report.json`.
- **`--shots`:** saves a screenshot of each failing width with the culprits outlined in red. Read them one at a time, and only for findings you don't understand from the text.
- **`--expect`** (repeatable) names elements that MUST be visible at every width, such as the cart, the buy button, the nav toggle or the price. Always pass the 2–5 that matter on your page.

## What it checks, most serious first
| check | means | usual fix |
|---|---|---|
| expected-missing / hidden / off-viewport / covered | a must-see element is gone, `display:none`, partly off-screen, or under another element (sticky header, cookie bar, modal) | fix the media query; `z-index`; scroll-margin |
| page-overflow-x | the page scrolls sideways | the element-off-viewport finding names the cause |
| element-off-viewport | the deepest element sticking out of the viewport, not inside a scroll/clip container | `max-width:100%`, `min-width:0` on flex/grid children, wrap long tables in `overflow-x:auto` |
| control-spills-card | a button or link sticking >1 px out of the nearest ancestor that draws a box (border or background), e.g. a buy button over the next card; positioned controls and anything inside a scroller exempt | `max-width:100%` + `white-space:normal` on the control, `min-width:0` on its flex/grid parent |
| text-invisible | text under 1.5:1 contrast with the background behind it, opacity included (skipped over images, gradients and SVG) | fix the colour; links inherit nothing from a band they sit on |
| text-clipped | text cut off by `overflow:hidden` with no ellipsis | let it wrap, or add `text-overflow:ellipsis` deliberately |
| text-overlap | two pieces of text drawn on top of each other (checked per line box; fixed and sticky elements ignored) | absolute positioning that doesn't survive narrow widths |
| text-spills-box | text wider than its box (long word, URL, number) | `overflow-wrap:anywhere`, `min-width:0` |
| scroll-hidden-content | at ≥1024px, a table column starting past its sideways scroller's visible edge, or a scroller holding >1.3× its width (scroll-snap carousels and code blocks exempt) | let the column wrap, or drop the scroller on desktop |
| image-distorted | image stretched >8% off its aspect ratio | `object-fit:cover` or `height:auto` |
| misaligned | a narrower block off-centre (>24 px) where ≥2 stacked siblings are centred | `margin-inline:auto` on the block, or align the siblings left too |
| tap-target-small | control under 24×24 px at ≤600 px (WCAG 2.2 AA 2.5.8); inline links in prose exempt | padding, not font size |
| text-too-small | under 12 px at ≤600 px | raise the type scale's smallest step |
| text-ellipsized | truncated with … (informational; is that what you wanted?) | — |

Each width is audited twice: once as loaded, then again with every `<details>` element opened (menus, accordions), so a dropdown that overruns the screen when tapped is caught. Those findings say "(with menus/details open)".

Not flagged on purpose:
- elements entirely off-screen (honeypots, off-canvas menus)
- text overlap from an open dropdown
- screen-reader-only 1 px elements
- overflow inside a scroll container

⚠️ Menus toggled by JavaScript (not `<details>`) are not opened. Pass `--expect` for their items, and audit with them open.

## Pages behind a login
The container can't see pages behind a login. The audit itself is a dependency-free function, so you can run the same checks in a real browser instead:
1. Save it: `docker run --rm ghcr.io/pushbuild/design-review:1.1.8 source uiaudit.js > uiaudit.js`
2. Set the viewport width.
3. Evaluate the file's contents in the page, through DevTools or your browser-automation tool's evaluate call.
4. Read the returned `{width, findings}`.
5. Repeat per width.

## Rules
- Fix the highest row first; one overflow often causes several findings below it.
- `LOAD INCOMPLETE` (exit 3) means a stylesheet, font, script or same-origin image failed at the network level on all 3 tries. No findings are reported, because a page without its CSS audits as a wreck. Re-run; if it persists, the asset is down.
- Done means no findings above `tap-target-small` at any width, and every `--expect` passes.
- The image ships `fixture.html`, a page that plants one bug per check. To confirm the audit works on this machine: `docker run --rm ghcr.io/pushbuild/design-review:1.1.8 source fixture.html > fixture.html`, audit it, and check that every check fires.

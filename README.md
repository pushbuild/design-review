# design-review for Claude Code

Claude Code builds pages that work but often look off: text that spills on a phone, a CTA two screens down, eleven font sizes. This plugin gives Claude two skills that **measure** a page in code instead of guessing from a screenshot.

| skill | what it answers |
|---|---|
| `ui-audit` | **Is it broken?** It sweeps a page across 13 viewport widths (320–1920 px) and tests every element. It checks horizontal overflow, off-screen elements, clipped, overlapping, spilling or invisible text, must-see elements hidden or covered, table columns hidden in sideways scrollers, small tap targets and text on phones, and stretched images. Each finding names the element and the widths. |
| `design-review` | **Is it good, and what are the 3–6 fixes?** It measures page length, footer length, CTA position against the fold and section padding, then takes phone, dark-mode and desktop screenshots. Claude scores an 11-row design rubric against them, applies the fixes through design tokens, and re-shoots to prove the page got better. |

No image model and no API keys. Everything runs locally in the official Playwright Docker image.

## Install
```
/plugin marketplace add pushbuild/design-review
/plugin install design-review@pushbuild
```
**Requires Docker.** The first run pulls `mcr.microsoft.com/playwright:v1.62.0-noble` and caches Playwright in `~/.cache/design-review-playwright`.

## Use
Ask Claude to "review the design of http://localhost:3000", "check this page on mobile" or "why does this look amateur". You can also run the scripts directly:
```bash
skills/ui-audit/uiaudit.sh https://example.com ./out/audit --expect "nav" --shots
skills/design-review/pagemetrics.sh ./out/metrics.json https://example.com
```
- **Local files:** pass a local HTML path to audit a file instead of a URL.
- **Dev servers:** a `localhost` URL runs the container on the host network, so it can reach your dev server.
- **Pages behind a login:** run `skills/ui-audit/uiaudit.js` in a real browser instead. It is a dependency-free function that returns the findings for the current viewport.

## Need more than a review?
Built by [Pushbuild](https://pushbuild.com/?utm_source=claude-plugin&utm_medium=directory&utm_campaign=design-review), which makes software, automations and AI tools for small businesses. For a free check of your live site, try the [Pushbuild website check](https://pushbuild.com/tools/website-check/?utm_source=claude-plugin&utm_medium=directory&utm_campaign=design-review).

## License
MIT

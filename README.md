# design-review for Claude Code

Claude Code builds pages that work but often look off: text that spills on a phone, a CTA two screens down, eleven font sizes. This plugin gives Claude two skills that **measure** a page in code instead of guessing from a screenshot.

| skill | what it answers |
|---|---|
| `ui-audit` | **Is it broken?** It sweeps a page across 13 viewport widths (320–1920 px) and tests every element. It checks horizontal overflow, off-screen elements, clipped, overlapping, spilling or invisible text, must-see elements hidden or covered, table columns hidden in sideways scrollers, small tap targets and text on phones, and stretched images. Each finding names the element and the widths. |
| `design-review` | **Is it good, and what are the 3–6 fixes?** It measures page length, footer length, CTA position against the fold and section padding, then takes phone, dark-mode and desktop screenshots. Claude scores an 11-row design rubric against them, applies the fixes through design tokens, and re-shoots to prove the page got better. |

The review is **free and local**: no image model and no API key. It runs in one public Docker image, `ghcr.io/pushbuild/design-review` (built from the official Playwright image), and sends nothing anywhere.

**Optional: redesign mockups.** When a page is clean but generic, the image's `mockup` command sends a screenshot plus the rubric findings to an image model and returns 1–3 redesign references for Claude to rebuild in code.
- **Pushbuild mockups:** set `PUSHBUILD_API_KEY`. Keys and credit are at [pushbuild.com/apis](https://pushbuild.com/apis/app/account?utm_source=github&utm_medium=readme&utm_campaign=design-review).
- **Your own OpenRouter key:** set `OPENROUTER_API_KEY`, and optionally `DESIGN_REVIEW_IMAGE_MODEL` (default `google/gemini-3-pro-image`).

**What leaves your machine.** Only this step sends data, and only when a key is set:
- **Pushbuild key:** the screenshot and brief go to Pushbuild, which passes them to OpenRouter (`google/gemini-3-pro-image`) to generate the images. Pushbuild stores only billing metadata: the time, the key, the image count and the USD cost. It keeps no screenshots, briefs or images. See the [privacy policy](https://pushbuild.com/privacy/) and [terms](https://pushbuild.com/terms/).
- **Your own OpenRouter key:** the screenshot and brief go straight from your machine to OpenRouter, under OpenRouter's terms. Pushbuild sees nothing.

## Install
```
/plugin marketplace add pushbuild/design-review
/plugin install design-review@pushbuild
```
**Requires Docker.** The first run pulls `ghcr.io/pushbuild/design-review:1.1.8` (public, no login). The plugin itself is only Markdown and JSON; the skills tell Claude which `docker run` command to use.

## Use
Ask Claude to "review the design of http://localhost:3000", "check this page on mobile" or "why does this look amateur". You can also run the image directly, from the folder that holds the page and the output:
```bash
I=ghcr.io/pushbuild/design-review:1.1.8
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" $I ui-audit https://example.com ./out/audit --expect "nav" --shots
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" $I pagemetrics ./out/metrics.json https://example.com
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" -e PUSHBUILD_API_KEY -e OPENROUTER_API_KEY \
  $I mockup ./out/metrics-1-1280.png "hero is weak, CTA below the fold" --out ./out/mock --variants 2
```
- **Local files:** pass a local HTML path inside the mounted folder to audit a file instead of a URL.
- **Dev servers:** for a `localhost` URL add `--network host`, so the container can reach your dev server.
- **Pages behind a login:** `docker run --rm $I source uiaudit.js > uiaudit.js` saves the audit as a dependency-free function; evaluate it in a real browser at each width to get the findings.

## Repository layout
| path | what |
|---|---|
| `plugin/` | the Claude Code plugin: `.claude-plugin/plugin.json`, the icon and two `SKILL.md` files |
| `image/` | the code (`uiaudit.mjs`, `uiaudit.js`, `pagemetrics.mjs`, `mockup.py`, `fixture.html`) and the `Dockerfile` |
| `.claude-plugin/marketplace.json` | the marketplace entry, pointing at `./plugin` |
| `.github/workflows/image.yml` | builds and pushes the image to GHCR on every `v*` tag and push to `main` |

## Need more than a review?
Built by [Pushbuild](https://pushbuild.com/?utm_source=claude-plugin&utm_medium=directory&utm_campaign=design-review), which makes software, automations and AI tools for small businesses. For a free check of your live site, try the [Pushbuild website check](https://pushbuild.com/tools/website-check/?utm_source=claude-plugin&utm_medium=directory&utm_campaign=design-review).

## License
MIT

---
name: design-review
description: Critique and fix the visual design of a web page or app screen you already have, without an image model. Measure it, score it against an 11-row design rubric (hierarchy, first screen on a phone, grouping, alignment, type, colour, components, rhythm, images, dark mode, copy), pick the 3–6 changes that matter most, apply them through design tokens, and re-shoot to prove it got better. Use when a page "works but looks plain / amateur / cluttered / off", before showing a UI to anyone, when asked to "review the design", "critique this page", "fix the layout", "make it look better", "clean up the UI", "tighten the spacing", "it looks cluttered", "the hero is weak", "polish this", or after building any page. Optional keyed step, image-generated redesign mockups.
---

# design-review

Two questions, two skills:

| question | skill |
|---|---|
| is it **broken**? (overflow, overlap, invisible text, misaligned) | `ui-audit`: run it first, and fix breakage before taste |
| is it **good**, and what are the few fixes? | **this one** |

## The pass (≈10 minutes; steps 1–5 need no image model and no API key)

1. **Measure.** Check breakage first, then the design numbers and screenshots:
   ```bash
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" \
     ghcr.io/pushbuild/design-review:1.1.8 ui-audit <url|./page.html> ./review/ua --widths 375,1440
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" \
     ghcr.io/pushbuild/design-review:1.1.8 pagemetrics ./review/v0.json <url|./page.html> [more urls]
   ```
   - Both run in one pinned Docker image (headless Chromium + Playwright); nothing installs on the host. Run from the folder that holds the page and the review output: it is mounted at the same path in the container, so local pages and outputs must be inside it. For a page elsewhere, add `-v /that/folder:/that/folder:ro` and pass its absolute path.
   - For a dev server on `localhost` or `127.0.0.1`, add `--network host` after `docker run --rm`; keep the default network for everything else (on the host network Chromium drops requests and pages load without CSS).
   - `pagemetrics` uses no LLM and takes about 20 s a page.
   - It prints FLAG lines for rubric rows 2, 3 and 8:
     - phone page over 15 screens
     - phone footer over 2 screens
     - first CTA below the fold
     - section padding over 64 px on a phone or over 120 px on desktop
   - It writes `v0-<n>-390.png`, `v0-<n>-390-dark.png` and `v0-<n>-1280.png` for each page. It is cheap enough for a daily sweep over every page.

   Fix any ui-audit finding above `tap-target-small` before going on. Then Read the three screenshots (phone, phone dark, desktop). ⛔ Read images from disk; never inline a base64 screenshot.
2. **Score the rubric below** from the screenshots. For each row write `ok` or the specific failure you can point to ("phone: CTA is 2.3 screens down"). If you cannot judge a row from the screenshots, say so.
3. **Choose 3–6 moves**, highest impact first: hierarchy and spacing beat colour and decoration. Each move names the element and the token it changes. If there are more than 6, do the top 6, re-shoot, and repeat.
4. **Apply through tokens.**
   - Use one `:root` token set, ≤ 8 type sizes, a 4/8 px spacing grid and one accent colour.
   - On an existing page, append one commented `/* design-review <date> */` block instead of editing all over the file, so the change reviews and reverts cleanly.
5. **Prove it.**
   - Run the same `pagemetrics` command with `./review/v1.json` and Read the new screenshots next to the v0 ones.
   - Re-run ui-audit.
   - Done means:
     - visibly better on phone AND desktop
     - no new FLAG lines and no new ui-audit findings
     - every rubric row you marked is now `ok` or explained
6. **When a fix isn't enough: mockups (optional, keyed).** If, after a pass, the page is clean but still has no identity (generic, "template-y"), or the brief is a new look, generate redesign references:
   ```bash
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":"$PWD" -w "$PWD" \
     -e PUSHBUILD_API_KEY -e OPENROUTER_API_KEY -e DESIGN_REVIEW_IMAGE_MODEL \
     ghcr.io/pushbuild/design-review:1.1.8 mockup ./review/v0-1-1280.png "<rubric failures + direction>" --out ./review/mock --variants 2 --viewport desktop
   ```
   - The `-e` flags pass the keys from the user's shell into the container by name; never write a key's value into the command.
   - It uses `PUSHBUILD_API_KEY` (Pushbuild's paid mockup service) or else `OPENROUTER_API_KEY` (your own OpenRouter key; `DESIGN_REVIEW_IMAGE_MODEL` picks the model). Each key is sent only to its own service: the Pushbuild key to Pushbuild, the OpenRouter key to OpenRouter.
   - With neither key it exits 2 and says where to get one. In that case, say so to the user and stop at step 5; don't ask for a key mid-task.
   - ⛔ It sends the screenshot and brief to that service. Never run it on a page showing private or customer data without the user's OK.
   - Read the mockups, pick one direction with the user, then rebuild it in code through the same tokens and re-run this pass on the result. The images are references, never assets to ship.

## The rubric — what good looks like, and the usual fix

| # | row | good | usual fix |
|---|---|---|---|
| 1 | **Hierarchy** | Squint at the screenshot: one thing reads first, the primary action second. H1 ≥ 2× body size. | Enlarge H1 a step or two, cut competing bold/colour, demote secondary buttons to outline/link. |
| 2 | **First screen (phone)** | At 390×800 you can see what it is, for whom, and the primary CTA without scrolling. | Shorten the hero copy to one line + one sentence, put the CTA in the hero, shrink/crop the hero image. |
| 3 | **Grouping** | Space inside a group < space between groups (e.g. 8–16 px inside, 48–96 px between sections). | Tokenise section padding (`--s12`/`--s16`), tighten heading-to-its-text gap to `--s2`–`--s3`. |
| 4 | **Alignment** | One left edge per column; centre only short hero/CTA blocks; nothing 3–10 px off its neighbours. | Put content in one `.wrap` with one padding; don't mix centred and left blocks in one stack. |
| 5 | **Type** | ≤ 8 sizes, ≤ 2 families, body 16–18 px, line length 45–75 ch, body line-height 1.5, headings 1.1–1.25. | `max-width: 65ch` on prose, snap sizes to the scale, `text-wrap: balance` on headings. |
| 6 | **Colour** | Neutrals + one accent on ≤ 10 % of the area; links look like links; contrast ≥ 4.5:1 body, ≥ 3:1 large. | Pull stray colours into tokens, reserve the accent for CTA/active, raise muted-text contrast. |
| 7 | **Components** | One primary button style, one secondary; one or two radii; one shadow; cards in a row equal height. | Make one `.btn` and `.btn-2`, one `--radius`, grid `align-items: stretch`. |
| 8 | **Rhythm & length** | Sections repeat a pattern (heading → text → content); phone page is not endless; footer is not a second page. | Merge thin sections, collapse long lists into a "see all", cap the footer at links + one line. |
| 9 | **Images** | Real, consistent crops (one aspect ratio per row), no stretched or tiny-in-big-box images. | `aspect-ratio` + `object-fit: cover` per row; one image treatment site-wide. |
| 10 | **Dark & states** | Dark mode keeps the hierarchy (not just inverted); hover/focus visible; focus ring on keyboard. | Redefine the same tokens under `prefers-color-scheme: dark`; `:focus-visible` outline in the accent. |
| 11 | **Copy on the page** | Real content, sentence case, no repeated blocks, no stray mid-sentence capitals, no lorem. | Fix the copy; design can't rescue filler. |

## Rules
- ⛔ Taste is not a finding. Every rubric failure names an element and a measurement or a visible fact on the screenshot: "feels busy" becomes "7 font sizes and 3 accent colours above the fold".
- ⛔ Real content only; never ship placeholder copy or invented facts to make a layout look full.
- Check the phone layout on every pass, not at the end; most visitors arrive on a phone.
- Don't fight a site's design system: if the page has tokens, change token values before adding new ones.
- Steps 1–5 send nothing anywhere. Only step 6 (mockups) sends a screenshot out, and only with a key set.

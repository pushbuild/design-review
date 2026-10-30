#!/usr/bin/env python3
"""Redesign mockups for design-review: send a page screenshot plus a brief, get back image references to rebuild from.

  mockup.py <screenshot.png> "<brief>" --out ./review/mock [--variants 2] [--viewport phone|desktop]

Optional and keyed; the rest of design-review is free and local. Which service it uses:
  PUSHBUILD_API_KEY   the Pushbuild mockup service (paid; screenshot and brief are sent to Pushbuild)
  OPENROUTER_API_KEY  bring your own OpenRouter key (you pay OpenRouter; screenshot and brief are sent to OpenRouter)
  neither             prints where to get a key and exits 2
Writes <out>-1.png, <out>-2.png, ... The images are references to rebuild in code, never assets to ship.
Standard library only.
"""
import argparse, base64, json, os, sys, urllib.error, urllib.request

PUSHBUILD_URL = os.environ.get("PUSHBUILD_API_URL", "https://api.pushbuild.com/design-mockups/run")
KEY_PAGE = "https://pushbuild.com/apis/app/account?utm_source=claude-plugin&utm_medium=cli&utm_campaign=design-review"
MODEL = os.environ.get("DESIGN_REVIEW_IMAGE_MODEL", "google/gemini-3-pro-image")
VERSION = "1.1.2"

PROMPT = """You are a senior product designer. The attached image is a screenshot of a real web page at {viewport} width.
Redesign it as a high-fidelity UI mockup of the SAME page: keep its real content, sections and purpose, and fix what
the brief below says is wrong. Clear hierarchy, generous but consistent spacing on a 4/8px grid, at most two type
families, neutral colours plus one accent used sparingly, one primary action per screen. Output one image at the same
{viewport} aspect. Variant {i} of {n}: make it a distinct direction from the other variants.

Brief: {brief}"""


def post(url, body, headers, timeout=240):
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {"error": e.reason}


def pushbuild(png, a):
    body = json.dumps({"screenshot": base64.b64encode(png).decode(), "brief": a.brief, "n": a.variants, "viewport": a.viewport}).encode()
    hdr = {"X-API-Key": os.environ["PUSHBUILD_API_KEY"], "Content-Type": "application/json", "X-Plugin-Version": VERSION}
    for attempt in (1, 2):
        code, j = post(PUSHBUILD_URL, body, hdr)
        if code == 200:
            print(f"Pushbuild: ${j.get('costUsd', '?')} charged, ${j.get('balanceUsd', '?')} credit left")
            return [base64.b64decode(i["b64"]) for i in j.get("items", [])]
        if code == 401:
            sys.exit(f"Pushbuild rejected the key (401). Check it, or get one, at {KEY_PAGE}")
        if code == 402:
            sys.exit(f"Out of Pushbuild credit. Add credit at {KEY_PAGE}")
        if attempt == 2 or code < 429:
            sys.exit(f"Pushbuild mockup service error {code}: {j.get('detail') or j.get('error', '')}. The local review still works without mockups.")


def openrouter(png, a):
    uri = "data:image/png;base64," + base64.b64encode(png).decode()
    hdr = {"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"], "Content-Type": "application/json",
           "HTTP-Referer": "https://github.com/pushbuild/design-review", "X-Title": "design-review for Claude Code"}
    out = []
    for i in range(1, a.variants + 1):
        msg = [{"type": "text", "text": PROMPT.format(viewport=a.viewport, i=i, n=a.variants, brief=a.brief)},
               {"type": "image_url", "image_url": {"url": uri}}]
        code, j = post("https://openrouter.ai/api/v1/chat/completions",
                       json.dumps({"model": MODEL, "modalities": ["image", "text"], "messages": [{"role": "user", "content": msg}]}).encode(), hdr)
        if code != 200:
            sys.exit(f"OpenRouter error {code}: {json.dumps(j)[:300]}")
        imgs = (j.get("choices") or [{}])[0].get("message", {}).get("images") or []
        if not imgs:
            sys.exit(f"OpenRouter returned no image from {MODEL}; set DESIGN_REVIEW_IMAGE_MODEL to an image model.")
        out.append(base64.b64decode(imgs[0]["image_url"]["url"].split(",", 1)[1]))
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("screenshot"); p.add_argument("brief")
    p.add_argument("--out", required=True); p.add_argument("--variants", type=int, default=2, choices=(1, 2, 3))
    p.add_argument("--viewport", choices=("phone", "desktop"), default="desktop")
    a = p.parse_args()
    a.brief = a.brief[:2000]
    if os.environ.get("PUSHBUILD_API_KEY"):
        fn, who = pushbuild, "Pushbuild"
    elif os.environ.get("OPENROUTER_API_KEY"):
        fn, who = openrouter, f"OpenRouter ({MODEL})"
    else:
        print("Mockups need a key, and the rest of design-review works without one.\n"
              f"  Pushbuild mockups: get a key at {KEY_PAGE}, then export PUSHBUILD_API_KEY=...\n"
              "  Your own OpenRouter key: export OPENROUTER_API_KEY=... (you pay OpenRouter per image)", file=sys.stderr)
        sys.exit(2)
    png = open(a.screenshot, "rb").read()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    print(f"Sending the screenshot and brief to {who} for {a.variants} mockup(s)...")
    for n, img in enumerate(fn(png, a), 1):
        f = f"{a.out}-{n}.png"
        open(f, "wb").write(img)
        print(f)


if __name__ == "__main__":
    main()

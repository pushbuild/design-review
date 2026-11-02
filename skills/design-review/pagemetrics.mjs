// Layout-rhythm metrics for design-review: page and footer length, first call to action vs the fold, section padding. No LLM.
// Run through pagemetrics.sh.
//   pagemetrics.mjs <out.json> <url> [url...]
// Per page at 390x844 and 1280x900: page length and footer height in screens, the first CTA vs the fold, the largest
// section padding. Prints FLAG lines past: phone page > 15 screens, phone footer > 2 screens, no CTA above the fold,
// section padding > 64px phone / > 120px desktop. Writes <out>-<n>-390.png, -390-dark.png and -1280.png per page.
import { chromium } from "playwright";
// Network errors that a retry can cure; anything else (blocked by ORB, aborted) fails the same way for real visitors.
const TRANSIENT = /ERR_(NETWORK_CHANGED|CONNECTION_(RESET|REFUSED|CLOSED|ABORTED|FAILED|TIMED_OUT)|TIMED_OUT|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|EMPTY_RESPONSE|NETWORK_IO_SUSPENDED|HTTP2_PROTOCOL_ERROR)/;
import { writeFileSync } from "fs";
const [out, ...urls] = process.argv.slice(2);
const VIEWS = [[390, 844], [1280, 900]];
const b = await chromium.launch(); const res = [], base = out.replace(/\.json$/, "");
for (const [n, u0] of urls.entries()) for (const [w, h] of VIEWS) {
  const u = /^https?:|^file:/.test(u0) ? u0 : "file://" + u0;
  // Stylesheets, fonts, scripts or same-origin images failing at the network level make every metric false: retry,
  // then report "load incomplete".
  const p = await b.newPage({ viewport: { width: w, height: h } }), failed = new Set(), org = /^https?:/.test(u) ? new URL(u).origin : null;
  p.on("requestfailed", r => { const t = r.resourceType();
    if (!TRANSIENT.test(r.failure()?.errorText || "")) return;
    if (/stylesheet|font|script/.test(t) || (t === "image" && (!org || r.url().startsWith(org)))) failed.add(r.url()); });
  // A 429/5xx stylesheet fires no requestfailed but leaves the page unstyled (parallel load); so does any sheet that never applied.
  const st = new Map(); p.on("response", r => { const c = r.status(); st.set(r.url(), c);
    if ((c === 429 || c >= 500) && /stylesheet|font|script/.test(r.request().resourceType())) failed.add(r.url()); });
  let ok = null;
  for (let i = 0; i < 3 && (!ok || failed.size); i++) { if (i) await p.waitForTimeout(3000 * i); failed.clear();
    ok = await p.goto(u, { waitUntil: "load", timeout: 45000 }).catch(() => null);
    if (ok && !failed.size) for (const h of await p.evaluate(() => [...document.querySelectorAll('link[rel~="stylesheet"]:not([disabled])')].filter(l => !l.sheet).map(l => l.href)).catch(() => []))
      if (!(st.get(h) >= 400 && st.get(h) < 500 && st.get(h) !== 429)) failed.add(h); }
  if (!ok || failed.size) { res.push({ url: u, w, error: ok ? `load incomplete: ${failed.size} assets failed (${[...failed][0]})` : "load failed" }); await p.close(); continue; }
  await p.waitForTimeout(800);
  const m = await p.evaluate(vh => {
    const H = document.documentElement.scrollHeight, vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const f = [...document.querySelectorAll("footer")].filter(vis).pop(), fh = f ? f.getBoundingClientRect().height : 0;
    const cta = [...document.querySelectorAll("a.btn,button:not([aria-label*=menu i]),a[class*=button],a[class*=cta],input[type=submit]")]
      .filter(e => vis(e) && !e.closest("header,nav,footer")).map(e => e.getBoundingClientRect().top + scrollY).sort((a, b) => a - b)[0];
    let pad = 0, padSel = "";
    for (const s of document.querySelectorAll("section,main>div,.band")) { const c = getComputedStyle(s);
      const v = Math.max(parseFloat(c.paddingTop), parseFloat(c.paddingBottom)); if (v > pad) { pad = v; padSel = s.id ? "#" + s.id : s.className || s.tagName; } }
    return { screens: +(H / vh).toFixed(1), footer_screens: +(fh / vh).toFixed(1), cta_top: cta === undefined ? null : Math.round(cta),
             cta_above_fold: cta === undefined ? null : cta + 48 <= vh, max_pad: pad, max_pad_sel: String(padSel).slice(0, 40) };
  }, h);
  const flags = [], phone = w < 600;
  if (phone && m.screens > 15) flags.push(`page is ${m.screens} phone screens long (>15): merge thin sections, collapse long lists`);
  if (phone && m.footer_screens > 2) flags.push(`footer is ${m.footer_screens} phone screens (>2): collapse link groups`);
  if (m.cta_above_fold === false) flags.push(`first CTA at ${m.cta_top}px, below the ${h}px fold: shorten the hero, move the CTA up`);
  if (m.cta_above_fold === null) flags.push("no CTA detected outside header/nav/footer (looks for .btn, button, [class*=button|cta]): check the screenshots by eye");
  if (m.max_pad > (phone ? 64 : 120)) flags.push(`section padding ${m.max_pad}px on ${m.max_pad_sel} (> ${phone ? 64 : 120}px)`);
  // Screenshots for the rubric: <out>-<n>-<width>.png, plus a dark-mode phone shot. Capped at 6000px tall.
  const shot = async (pg, f) => pg.screenshot({ path: f, clip: { x: 0, y: 0, width: w, height: Math.min(6000, await pg.evaluate(() => document.documentElement.scrollHeight)) } });
  await shot(p, `${base}-${n + 1}-${w}.png`);
  if (phone) { const d = await b.newPage({ viewport: { width: w, height: h }, colorScheme: "dark" });
    if (await d.goto(u, { waitUntil: "load", timeout: 45000 }).catch(() => null)) { await d.waitForTimeout(800); await shot(d, `${base}-${n + 1}-${w}-dark.png`); }
    await d.close(); }
  res.push({ url: u, w, ...m, flags }); await p.close();
}
await b.close(); writeFileSync(out, JSON.stringify(res, null, 1));
for (const r of res) {
  console.log(`${r.url} @${r.w}: ` + (r.error || `${r.screens} screens · footer ${r.footer_screens} · first CTA ${r.cta_top === null ? "none found" : r.cta_top + "px"} · max section padding ${r.max_pad}px`));
  for (const f of r.flags || []) console.log("  FLAG " + f);
}

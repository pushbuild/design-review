// Sweep a page across many viewport widths, run uiaudit.js at each, group findings by element.
//   uiaudit.mjs <url> --out <prefix> [--widths 320,375,...] [--expect "sel1" --expect "sel2"] [--dark] [--shots] [--text-scale 1.3]
// Writes <prefix>-report.json; with --shots, a screenshot of each width that has findings, with the
// offending elements outlined in red.
import { chromium } from "playwright";
// Network errors that a retry can cure; anything else (blocked by ORB, aborted) fails the same way for real visitors.
const TRANSIENT = /ERR_(NETWORK_CHANGED|CONNECTION_(RESET|REFUSED|CLOSED|ABORTED|FAILED|TIMED_OUT)|TIMED_OUT|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|EMPTY_RESPONSE|NETWORK_IO_SUSPENDED|HTTP2_PROTOCOL_ERROR)/;
import fs from "node:fs";

const argv = process.argv.slice(2);
const all = k => argv.flatMap((a, i) => a === k ? [argv[i + 1]] : []);
const opt = (k, d) => all(k)[0] ?? d;
const url = /^https?:|^file:/.test(argv[0]) ? argv[0] : "file://" + argv[0];
const out = opt("--out", "uiaudit"), expect = all("--expect"), scale = Number(opt("--text-scale", "1"));
const widths = opt("--widths", "320,360,375,390,414,480,600,768,820,1024,1280,1440,1920").split(",").map(Number);
const AUDIT = fs.readFileSync(new URL("./uiaudit.js", import.meta.url), "utf8");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: widths[0], height: 800 }, colorScheme: argv.includes("--dark") ? "dark" : "light" });
const page = await ctx.newPage();
// A page that loaded without its CSS or images audits as a wreck: every finding is false. A stylesheet, font, script or
// same-origin image that fails at the network level (not a 404, which is the site's own bug) ⇒ reload, twice; still
// failing ⇒ report "load incomplete" and no findings.
const failed = new Set(), origin = /^https?:/.test(url) ? new URL(url).origin : null;
page.on("requestfailed", r => { const t = r.resourceType();
  if (!TRANSIENT.test(r.failure()?.errorText || "")) return;   // ERR_BLOCKED_BY_ORB etc. fail the same in a real browser
  if (/stylesheet|font|script/.test(t) || (t === "image" && (!origin || r.url().startsWith(origin)))) failed.add(`${r.url()} (${r.failure()?.errorText})`); });
// Under parallel load a server answers CSS with 429/5xx (no requestfailed event) and the page measures unstyled:
// objectFit "fill" everywhere, 40+ tap targets. Count those as transient too, and after load
// require every <link rel=stylesheet> to have applied, unless the site itself 404s it.
const status = new Map();
page.on("response", r => { const t = r.request().resourceType(), c = r.status(); status.set(r.url(), c);
  if ((c === 429 || c >= 500) && /stylesheet|font|script/.test(t)) failed.add(`${r.url()} (HTTP ${c})`); });
const unstyled = () => page.evaluate(() => [...document.querySelectorAll('link[rel~="stylesheet"]:not([disabled])')]
  .filter(l => !l.sheet).map(l => l.href));   // no sheet = never loaded (an empty file still has one)
for (const wait of [0, 3000, 10000]) {
  if (wait) await page.waitForTimeout(wait);
  failed.clear();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(e => failed.add(`${url} (${e.message.split("\n")[0]})`));
  if (!failed.size) for (const h of await unstyled().catch(() => [])) if (!(status.get(h) >= 400 && status.get(h) < 500 && status.get(h) !== 429)) failed.add(`${h} (stylesheet not applied)`);
  if (!failed.size) break;
}
if (failed.size) {
  fs.writeFileSync(`${out}-report.json`, JSON.stringify({ url, widths, loadIncomplete: [...failed], groups: [] }, null, 1));
  console.log(`${url}\nLOAD INCOMPLETE after 3 tries, no findings reported:\n  ${[...failed].slice(0, 5).join("\n  ")}`);
  await browser.close(); process.exit(3);
}
await page.evaluate(e => { window.__uiauditExpect = e; }, expect);

const byKey = new Map(), perWidth = {};
for (const w of widths) {
  await page.setViewportSize({ width: w, height: w <= 600 ? 800 : 900 });
  await page.waitForTimeout(300);                       // let resize observers and media queries settle
  // --text-scale: a phone's text-size setting (Android Chrome; 115–130% is common) scales every font, px included, and leaves
  // px line-heights and box widths alone. Emulated per width (media queries change the base sizes), undone after.
  if (scale !== 1) await page.evaluate(k => {
    const els = [...document.querySelectorAll("body, body *")], fs = els.map(e => parseFloat(getComputedStyle(e).fontSize));
    window.__uiauditFs = els.map(e => [e, e.style.getPropertyValue("font-size"), e.style.getPropertyPriority("font-size")]);
    els.forEach((e, i) => e.style.setProperty("font-size", fs[i] * k + "px", "important"));
  }, scale);
  const r = await page.evaluate(AUDIT);
  // Second pass with every closed <details> opened (menus, accordions): what a user sees after tapping.
  // Overlap is skipped there: an open dropdown covers the page by design.
  const opened = await page.evaluate(() => { const d = [...document.querySelectorAll("details:not([open])")]; d.forEach(x => x.open = true); window.__uiauditOpened = d; return d.length; });
  if (opened) {
    await page.waitForTimeout(150);
    const seen = new Set(r.findings.map(f => f.check + f.sel));
    for (const f of (await page.evaluate(AUDIT)).findings)
      if (!seen.has(f.check + f.sel) && f.check !== "text-overlap") r.findings.push({ ...f, detail: f.detail + " (with menus/details open)" });
    await page.evaluate(() => window.__uiauditOpened.forEach(x => x.open = false));
  }
  perWidth[w] = r.findings.length;
  for (const f of r.findings) {
    const k = f.check + " | " + f.sel;
    if (!byKey.has(k)) byKey.set(k, { check: f.check, sel: f.sel, widths: [], detail: {} });
    const g = byKey.get(k); if (!g.widths.includes(w)) g.widths.push(w); g.detail[w] ??= f.detail;
  }
  if (argv.includes("--shots") && r.findings.length) {
    await page.evaluate(sels => sels.forEach(s => { try { const e = document.querySelector(s); if (e) e.style.outline = "3px solid red"; } catch {} }),
      [...new Set(r.findings.map(f => f.sel))]);
    await page.screenshot({ path: `${out}-${w}.png`, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(4000, await page.evaluate(() => document.documentElement.scrollHeight)) } });
    await page.evaluate(() => document.querySelectorAll("[style*='outline']").forEach(e => e.style.outline = ""));
  }
  if (scale !== 1) await page.evaluate(() => window.__uiauditFs.forEach(([e, v, p]) => v ? e.style.setProperty("font-size", v, p) : e.style.removeProperty("font-size")));
}
await browser.close();

const SEV = ["expected-missing", "expected-hidden", "expected-off-viewport", "expected-covered", "page-overflow-x", "element-off-viewport", "control-spills-card",
  "text-invisible", "text-clipped", "text-overlap", "text-spills-box", "scroll-hidden-content", "text-clipped-vertically", "image-distorted", "misaligned", "tap-target-small", "text-too-small", "text-ellipsized"];
const groups = [...byKey.values()].sort((a, b) => SEV.indexOf(a.check) - SEV.indexOf(b.check) || b.widths.length - a.widths.length);
const range = ws => ws.length === widths.length ? "all widths" : ws.join(",");
fs.writeFileSync(`${out}-report.json`, JSON.stringify({ url, widths, textScale: scale, perWidth, groups }, null, 1));

console.log(`${url}${scale !== 1 ? ` (text ${Math.round(scale * 100)}%)` : ""}\nfindings per width: ${widths.map(w => `${w}:${perWidth[w]}`).join(" ")}`);
const counts = {}; for (const g of groups) counts[g.check] = (counts[g.check] || 0) + 1;
console.log(Object.keys(counts).length ? "by check: " + Object.entries(counts).map(([k, v]) => `${k}×${v}`).join("  ") : "no findings");
for (const g of groups.slice(0, 40)) {
  const w = g.widths[0];
  console.log(`  ${g.check.padEnd(22)} ${g.sel}\n      @ ${range(g.widths)} — ${g.detail[w]}`);
}
if (groups.length > 40) console.log(`  … ${groups.length - 40} more in ${out}-report.json`);

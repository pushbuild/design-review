// In-page layout audit for ONE viewport. Pure function, no dependencies, so it can be injected by
// Playwright (uiaudit.mjs) or in a real browser (e.g. a DevTools snippet or browser_evaluate).
// Returns {width, height, findings:[{check, sel, detail}]}.
// window.__uiauditExpect = ["css selector", ...] names elements that MUST be visible.
(() => {
  const W = innerWidth, H = innerHeight, phone = W <= 600, out = [];
  const add = (check, el, detail) => out.push({ check, sel: sel(el), detail });
  function sel(el) {
    if (!el || el === document.body) return "body";
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(p + "#" + e.id); break; }
      const c = [...e.classList].filter(x => !/^(css|sc|jsx)-|\d{3,}/.test(x)).slice(0, 2);
      if (c.length) p += "." + c.join(".");
      const sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(p);
    }
    return parts.join(" > ");
  }
  const inClosedDetails = el => { const d = el.closest("details:not([open])"); return d && !el.closest("summary") && d !== el; };
  const visible = (el, s = getComputedStyle(el)) => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05
      && !inClosedDetails(el) && el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false;
  };
  // Entirely outside the viewport (left:-9999px honeypots, off-canvas menus) is deliberate; partly outside is the bug.
  const parked = r => r.right <= 0 || r.left >= W;
  // An ancestor that scrolls or clips horizontally contains the overflow on purpose.
  const clippedBy = el => {
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if (o !== "visible") return e;
    }
    return null;
  };
  // WCAG contrast of an element's text against the first opaque background behind it, opacity included.
  // null when a background image, gradient or filter sits in the way: the colour behind the text is unknown.
  const cx2d = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = c => { cx2d.clearRect(0, 0, 1, 1); cx2d.fillStyle = "#000"; cx2d.fillStyle = c; cx2d.fillRect(0, 0, 1, 1); const d = cx2d.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const blend = (top, a, bot) => top.slice(0, 3).map((v, i) => v * a + bot[i] * (1 - a));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (e, s) => {
    if (e.closest("svg")) return null;   // SVG text paints with fill over sibling shapes, not CSS backgrounds
    const layers = []; let op = 1;
    for (let a = e; a; a = a.parentElement) {
      const t = a === e ? s : getComputedStyle(a);
      if (t.backgroundImage !== "none" || t.filter !== "none" || t.mixBlendMode !== "normal") return null;
      op *= +t.opacity;
      const b = rgba(t.backgroundColor);
      if (b[3] > 0) { layers.push(b); if (b[3] >= 0.99) break; }
    }
    let bg = [255, 255, 255];   // canvas default
    for (const b of layers.reverse()) bg = blend(b, b[3], bg);
    const c = rgba(s.color), fg = blend(c, c[3] * op, bg);
    const [h, l] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (h + 0.05) / (l + 0.05);
    if (ratio >= 1.5) return ratio;
    // A low ratio is only real if nothing positioned paints between the text and that background (a button's
    // fill drawn by an absolute sibling layer, Claude Code docs topbar): any such box under the text ⇒ unknown.
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (let a = e.parentElement, kid = e; a; kid = a, a = a.parentElement) {
      for (const k of a.children) {
        if (k === kid || !/absolute|fixed|sticky|relative/.test(getComputedStyle(k).position)) continue;
        const q = k.getBoundingClientRect();
        if (q.left <= x && x <= q.right && q.top <= y && y <= q.bottom) return null;
      }
      if (a === document.body) break;
    }
    return ratio;
  };
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  const els = [...document.querySelectorAll("body *")].filter(e => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|svg|path|BR)$/i.test(e.tagName));

  // 1 · page scrolls sideways, and the deepest elements that cause it
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) add("page-overflow-x", document.body, `page is ${sw}px wide in a ${W}px viewport`);
  const over = els.filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1) && !parked(r) && visible(e) && !clippedBy(e); });
  const overSet = new Set(over);
  for (const e of over) if (!overSet.has(e.parentElement)) {   // the outermost culprit, not each child
    const r = e.getBoundingClientRect(); add("element-off-viewport", e, `spans ${Math.round(r.left)}…${Math.round(r.right)}px of ${W}`);
  }

  const texts = [];
  for (const e of els) {
    if (!ownText(e)) continue;
    const s = getComputedStyle(e);
    if (!visible(e, s)) continue;
    texts.push(e);
    const r = e.getBoundingClientRect(), fs = parseFloat(s.fontSize);
    // 2 · text cut off by its own box (ellipsis is a deliberate choice, reported separately)
    const clips = /hidden|clip/.test(s.overflowX + s.overflow);
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
      if (clips && s.textOverflow !== "ellipsis") add("text-clipped", e, `"${e.textContent.trim().slice(0, 40)}" needs ${e.scrollWidth}px, box ${e.clientWidth}px`);
      else if (clips) add("text-ellipsized", e, `"${e.textContent.trim().slice(0, 40)}" truncated with …`);
      else if (!clippedBy(e)) add("text-spills-box", e, `"${e.textContent.trim().slice(0, 40)}" ${e.scrollWidth}px in a ${e.clientWidth}px box`);
    }
    if (e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0 && clips && /hidden|clip/.test(s.overflowY))
      add("text-clipped-vertically", e, `"${e.textContent.trim().slice(0, 40)}" needs ${e.scrollHeight}px height, box ${e.clientHeight}px`);
    // 3 · unreadable on a phone
    if (phone && fs < 12) add("text-too-small", e, `${fs}px at ${W}px wide`);
    // 3b · text that all but vanishes into its background (katamacreek: dark-green links on a dark-green band)
    const cr = contrast(e, s);
    if (cr && cr < 1.5) add("text-invisible", e, `"${e.textContent.trim().slice(0, 40)}" contrast ${cr.toFixed(2)}:1 against its background`);
    void r;
  }

  // 4 · text overlapping other text (not ancestor/descendant), capped for big pages
  // Per line box of the TEXT itself (Range rects), not the element box: an inline link that wraps has a bounding
  // box spanning both lines, and nowrap text in a shrunk flex item spills past its box into the next one (returnedequity
  // nav, a scroll row, so the spill check exempts it). Text counts only inside every box that clips it (.sr-only, scrollers).
  const textRects = e => {
    const B = [], out = [], rg = document.createRange();
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") B.push(a.getBoundingClientRect());
    }
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) {
      rg.selectNodeContents(n);
      for (let { left, right, top, bottom } of rg.getClientRects()) {
        for (const b of B) { left = Math.max(left, b.left); right = Math.min(right, b.right); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
        if (right - left > 1 && bottom - top > 1) out.push({ left, right, top, bottom, width: right - left, height: bottom - top });
      }
    }
    return out;
  };
  const T = texts.slice(0, 700).map(e => [e, textRects(e)]);
  const hit = (A, B) => { for (const ra of A) for (const rb of B) {
    const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (x > 4 && y > 4 && x * y > 0.2 * Math.min(ra.width * ra.height, rb.width * rb.height)) return [x, y]; } return null; };
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const [a, ra] = T[i], [b, rb] = T[j];
    if (a.contains(b) || b.contains(a)) continue;
    const h = hit(ra, rb), [x, y] = h || [];
    if (h) {
      const sa = getComputedStyle(a), sb = getComputedStyle(b);
      if (sa.position === "fixed" || sb.position === "fixed" || sa.position === "sticky" || sb.position === "sticky") continue; // scroll-position dependent
      add("text-overlap", a, `overlaps ${sel(b)} by ${Math.round(x)}×${Math.round(y)}px`);
    }
  }

  // 5 · tap targets on a phone (WCAG 2.2 AA 2.5.8: 24×24 minimum)
  if (phone) for (const e of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [onclick]")) {
    if (!visible(e)) continue;
    const r = e.getBoundingClientRect();
    if ((r.width < 24 || r.height < 24) && !(e.tagName === "A" && getComputedStyle(e).display === "inline" && e.closest("p, li, td")))
      add("tap-target-small", e, `${Math.round(r.width)}×${Math.round(r.height)}px`);
  }

  // 6 · elements that must be visible: present, sized, inside the viewport horizontally, not covered
  for (const q of window.__uiauditExpect || []) {
    const e = document.querySelector(q);
    if (!e) { out.push({ check: "expected-missing", sel: q, detail: "no element matches" }); continue; }
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    if (!visible(e, s)) { out.push({ check: "expected-hidden", sel: q, detail: `display:${s.display} visibility:${s.visibility} ${Math.round(r.width)}×${Math.round(r.height)}` }); continue; }
    if (r.right > W + 1 || r.left < -1) { out.push({ check: "expected-off-viewport", sel: q, detail: `spans ${Math.round(r.left)}…${Math.round(r.right)}px of ${W}` }); continue; }
    e.scrollIntoView({ block: "center" });
    const r2 = e.getBoundingClientRect(), top = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    if (top && top !== e && !e.contains(top) && !top.contains(e)) out.push({ check: "expected-covered", sel: q, detail: `covered by ${sel(top)}` });
    scrollTo(0, 0);
  }

  // 7 · images stretched out of their aspect ratio
  for (const img of document.images) {
    if (!img.naturalWidth || !visible(img) || getComputedStyle(img).objectFit !== "fill") continue;
    // offsetWidth/Height are pre-transform: a rotated image has a larger bounding box, not a distorted one
    if (!img.offsetHeight) continue;
    const k = (img.offsetWidth / img.offsetHeight) / (img.naturalWidth / img.naturalHeight);
    if (k > 1.08 || k < 0.92) add("image-distorted", img, `aspect off by ${Math.round(Math.abs(1 - k) * 100)}%`);
  }
  // 8 · one block off-centre among centred stacked siblings (a left-aligned search box under a centred h1)
  // Centred = a narrower box whose centre is within 4px of the parent content box's, or a full-width box with text-align:center.
  for (const p of els) {
    if (p.children.length < 3) continue;
    const kids = [...p.children].filter(k => { const s = getComputedStyle(k); return !/absolute|fixed/.test(s.position) && s.float === "none" && visible(k, s); });
    if (kids.length < 3) continue;
    const ps = getComputedStyle(p), pr = p.getBoundingClientRect();
    const cl = pr.left + parseFloat(ps.borderLeftWidth) + parseFloat(ps.paddingLeft), cr = pr.right - parseFloat(ps.borderRightWidth) - parseFloat(ps.paddingRight), cx = (cl + cr) / 2;
    if (cr - cl < 200) continue;
    const R = kids.map(k => k.getBoundingClientRect());
    const alone = R.map((r, i) => R.every((q, j) => j === i || q.bottom <= r.top + 1 || q.top >= r.bottom - 1)); // not in a row with a sibling
    const narrow = R.map(r => r.width < cr - cl - 16), off = R.map(r => r.left + r.width / 2 - cx);
    const centred = kids.filter((k, i) => alone[i] && (narrow[i] ? Math.abs(off[i]) <= 4 : getComputedStyle(k).textAlign === "center")).length;
    if (centred < 2) continue;
    kids.forEach((k, i) => { if (alone[i] && narrow[i] && Math.abs(off[i]) > 24) add("misaligned", k, `centre ${Math.round(off[i])}px off the axis of ${centred} centred siblings`); });
  }
  // 9 · desktop content hidden in a sideways scroller (e.g. a 2336px table in a 1180px box, 4 of 5 columns
  // off-screen at 1920). Phone scrollers are a fair layout; carousels (scroll-snap) and code blocks scroll on purpose.
  if (W >= 1024) for (const e of els) {
    const s = getComputedStyle(e);
    if (!/auto|scroll/.test(s.overflowX) || e.clientWidth < 200 || !visible(e, s)) continue;
    if (s.scrollSnapType !== "none" || e.matches("pre, code") || e.querySelector(":scope > pre, :scope > code")) continue;
    const r = e.getBoundingClientRect(), right = r.left + e.clientLeft + e.clientWidth;
    const cells = [...e.querySelectorAll("th, td")], hidden = cells.filter(c => c.getBoundingClientRect().left >= right - 1 && visible(c));
    if (hidden.length) add("scroll-hidden-content", e, `${new Set(hidden.map(c => c.cellIndex)).size} table column(s) start past the visible ${e.clientWidth}px; table is ${e.scrollWidth}px`);
    else if (e.scrollWidth > 1.3 * e.clientWidth) add("scroll-hidden-content", e, `${e.scrollWidth}px of content in a ${e.clientWidth}px sideways scroller`);
  }
  return { width: W, height: H, findings: out };
})()

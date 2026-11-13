// HTML for every News slide (1080 × 1350). Rendered by headless Chrome in render.ts.
// Style rules live in the style guide (Studio → News → Style); keep this file in step with it.
import { pathToFileURL } from "node:url";
import path from "node:path";

export const W = 1080, H = 1350;
const FONTS = path.join(import.meta.dirname, "fonts");
const f = (name: string) => pathToFileURL(path.join(FONTS, name)).href;

export const GREEN = "#00C16A";
export const RED = "#E5262B";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** *word* → highlighted (green on the hook, bold elsewhere). */
const marks = (s: string) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
const src = (p: string) => (/^(https?:|data:|file:)/.test(p) ? p : pathToFileURL(path.resolve(p)).href);

export const MARK = `<svg viewBox="0 0 260 290" aria-hidden="true"><path fill="${GREEN}" d="M4 0H260L242 52H153L135 243L67 290L91 52H0Z"/></svg>`;

const BASE = `
@font-face { font-family: Anton; src: url(${f("Anton-Regular.ttf")}); }
@font-face { font-family: Inter; src: url(${f("Inter.ttf")}); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body { font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; position: relative; }
`;

// Fits the headline: biggest size from `max` down to `min` that stays within `lines` lines and the width.
const FIT = `
<script>
function fit(el, max, min, lines) {
  for (let s = max; s >= min; s -= 2) {
    el.style.fontSize = s + 'px';
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    if (el.scrollHeight <= lh * lines + 2 && el.scrollWidth <= el.clientWidth + 1) return s;
  }
  return min;
}
function cover(el) {
  const z = parseFloat(el.dataset.cover || '1');
  const url = getComputedStyle(el).backgroundImage.slice(5, -2);
  return new Promise((ok) => { const im = new Image(); im.onload = () => {
    const r = Math.max(el.clientWidth / im.naturalWidth, el.clientHeight / im.naturalHeight) * z;
    el.style.backgroundSize = Math.round(im.naturalWidth * r) + 'px ' + Math.round(im.naturalHeight * r) + 'px'; ok();
  }; im.onerror = ok; im.src = url; });
}
Promise.all([document.fonts.ready, ...[...document.querySelectorAll('[data-cover]')].map(cover)]).then(() => {
  document.querySelectorAll('[data-fit]').forEach((el) => {
    const [max, min, lines] = el.dataset.fit.split(',').map(Number);
    el.dataset.size = fit(el, max, min, lines);
  });
  document.body.dataset.ready = '1';
});
</script>`;

export type Hook = {
  type: "hook";
  headline: string;
  /** Only when it says something: BREAKING (red), TRENDING, REPORT, OFFICIAL, EXCLUSIVE… ; "quote" = the
   *  quote-mark tag (the headline is the person's own words, written with “ ” around it); "" = no tag. */
  tag: string;
  photo?: string;
  /** photo = full-bleed photo (default); cutout = subject lifted onto a blurred copy of the same photo;
   *  chart = real market data drawn as a line (stories with no person, e.g. a price move). */
  mode?: "cutout" | "photo" | "chart";
  chart?: { points: number[]; price: string; change: string; note: string; down?: boolean };
  cutout?: string;
  /** photo mode: zoom (1 = cover, 1.4 = 40% closer) and the point of the photo kept in frame (0–1). */
  zoom?: number;
  focusX?: number;
  focusY?: number;
  /** cutout: height of the subject as a share of the slide (default 0.86) and horizontal offset in px */
  scale?: number;
  offsetX?: number;
  /** A second person or a logo in a white-ringed circle (Polymarket's Musk/GOP layout). */
  inset?: { src: string; x?: number; y?: number; size?: number; zoom?: number; focusX?: number; focusY?: number; bg?: string };
  /** Kept in Studio only (photos[]); never drawn on the slide. */
  credit?: string;
};

function chartSvg(c: NonNullable<Hook["chart"]>) {
  const p = c.points, lo = Math.min(...p), hi = Math.max(...p), w = W, h = 640, top = 20, bot = 30;
  const x = (i: number) => (i / (p.length - 1)) * (w - 30);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (h - top - bot);
  const line = p.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const col = c.down === false ? GREEN : RED;
  return `<div class="chart" style="background: radial-gradient(80% 55% at 70% 45%, ${col}2e, transparent 70%), #070808">
<div class="grid"></div>
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".42"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
<filter id="gl"><feGaussianBlur stdDeviation="7"/></filter></defs>
<path d="${line}L${w},${h}L0,${h}Z" fill="url(#g)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="14" stroke-opacity=".45" filter="url(#gl)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="7" stroke-linejoin="round"/>
<circle cx="${x(p.length - 1)}" cy="${y(p[p.length - 1])}" r="15" fill="${col}"/><circle cx="${x(p.length - 1)}" cy="${y(p[p.length - 1])}" r="30" fill="${col}" fill-opacity=".25"/></svg>
<div class="px"><b>${esc(c.price)}</b><span style="background:${col}; color:${c.down === false ? "#0b0c0c" : "#fff"}">${esc(c.change)}</span></div>
<div class="cnote">${esc(c.note)}</div></div>`;
}

const QUOTE_GLYPH = `<svg viewBox="0 0 64 44" aria-hidden="true"><path fill="currentColor" d="M0 44V27C0 12 7 3 21 0l3 7c-7 2-11 7-11 13h11v24H0Zm34 0V27c0-15 7-24 21-27l3 7c-7 2-11 7-11 13h11v24H34Z"/></svg>`;

function tagHtml(tag: string) {
  const t = (tag || "").trim();
  if (!t) return "";
  if (/^quote$/i.test(t)) return `<div class="tag q">${QUOTE_GLYPH}</div>`;
  if (/^breaking/i.test(t)) return `<div class="tag br">${esc(t)}</div>`;
  return `<div class="tag">${esc(t)}</div>`;
}

const bgImg = (file: string, zoom = 1, fx = 0.5, fy = 0.25) =>
  `background-image:url('${src(file)}'); background-size: ${Math.round(zoom * 100)}% auto; background-position: ${Math.round(fx * 100)}% ${Math.round(fy * 100)}%`;

export function hookHtml(s: Hook) {
  const scale = s.scale ?? 0.86;
  const bg = s.mode === "chart" && s.chart ? chartSvg(s.chart) : s.mode === "cutout" && s.cutout
    ? `<div class="bgblur" style="background-image:url('${src(s.photo!)}')"></div>
       <img class="cut" src="${src(s.cutout)}" style="height:${Math.round(H * scale)}px; transform: translateX(calc(-50% + ${s.offsetX ?? 0}px))">`
    : `<div class="full" data-cover="${s.zoom ?? 1}" style="${bgImg(s.photo!, 1, s.focusX ?? 0.5, s.focusY ?? 0.25)}"></div>`;
  const i = s.inset;
  const inset = i
    ? `<div class="inset" data-cover="${i.zoom ?? 1}" style="left:${i.x ?? 640}px; top:${i.y ?? 200}px; width:${i.size ?? 360}px; height:${i.size ?? 360}px; background-color:${i.bg ?? "#fff"}; ${bgImg(i.src, 1, i.focusX ?? 0.5, i.focusY ?? 0.3)}"></div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #070808; color: #fff; }
.full { position: absolute; inset: 0; background-repeat: no-repeat; }
.bgblur { position: absolute; inset: -60px; background: center/cover; filter: blur(30px) saturate(.95) brightness(.5); }
.cut { position: absolute; bottom: 0; left: 50%; width: auto; }
.fade { position: absolute; left: 0; right: 0; bottom: 0; height: 62%; background: linear-gradient(180deg, rgba(7,8,8,0) 0%, rgba(7,8,8,.55) 30%, rgba(7,8,8,.92) 58%, #070808 80%); }
.topfade { position: absolute; left: 0; right: 0; top: 0; height: 200px; background: linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0)); }
.inset { position: absolute; border-radius: 50%; border: 9px solid #fff; background-repeat: no-repeat; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
.text { position: absolute; left: 34px; right: 34px; bottom: 58px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
.tag { font: 400 40px/1 Anton; letter-spacing: .01em; text-transform: uppercase; padding: 12px 20px 11px; border-radius: 10px;
  background: #fff; color: #070808; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.tag.br { background: ${RED}; color: #fff; border: 3px solid #fff; padding: 9px 17px 8px; }
.tag.q { background: ${GREEN}; color: #070808; padding: 14px 26px; display: flex; }
.tag.q svg { width: 62px; height: 42px; }
h1 { font-family: Anton; font-weight: 400; text-transform: uppercase; text-align: center; line-height: .93; width: 100%; letter-spacing: -.003em; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.4); }
h1 em { font-style: normal; color: ${s.mode === "chart" && s.chart?.down !== false ? RED : GREEN}; }
.logo { position: absolute; top: 46px; left: 50px; width: 44px; height: 49px; z-index: 10; filter: drop-shadow(0 2px 10px rgba(0,0,0,.45)); }
.chart { position: absolute; inset: 0; }
.chart .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 108px 108px; }
.chart svg { position: absolute; left: 0; top: 330px; width: 100%; height: 640px; }
.px { position: absolute; left: 50px; top: 140px; display: flex; align-items: center; gap: 22px; }
.px b { font: 400 150px/1 Anton; letter-spacing: .005em; }
.px span { font: 800 40px/1 Inter; padding: 12px 18px; border-radius: 12px; }
.cnote { position: absolute; left: 52px; top: 302px; font: 500 24px/1.2 Inter; color: rgba(255,255,255,.55); }
</style></head><body>
${bg}${inset}${s.mode === "chart" ? "" : '<div class="topfade"></div><div class="fade"></div>'}
<div class="logo">${MARK}</div>
<div class="text">${tagHtml(s.tag)}<h1 data-fit="230,96,3">${marks(s.headline)}</h1></div>
${FIT}</body></html>`;
}

export type Card = {
  type: "card";
  /** The line at the top: who said what, where and when. One or two sentences. *word* = bold. */
  text: string;
  media?:
    | { kind: "image"; src: string; fit?: "cover" | "contain"; aspect?: number; bg?: string; focusY?: number; framed?: boolean }
    | { kind: "video"; src: string; aspect?: number; start?: string; end?: string; page?: string };
  quote?: { text: string; who: string; role?: string; photo?: string };
  stat?: { value: string; label: string };
  /** Kept in Studio only (sources[]); never drawn on the slide. */
  source?: string;
  credit?: string;
};

/** Returns the HTML plus, for video cards, the box the video is laid into. */
export function cardHtml(s: Card) {
  const m = s.media;
  const aspect = m?.aspect ?? 16 / 9;
  const boxH = Math.round(W / aspect);
  const media = !m ? "" : m.kind === "image" && m.framed
    ? `<div class="framed"><img src="${src(m.src)}"></div>`
    : m.kind === "image"
    ? `<div class="media" style="height:${boxH}px; background:${m.bg ?? (m.fit === "contain" ? "#f1f1ee" : "#111")}"><img src="${src(m.src)}" style="object-fit:${m.fit ?? "cover"}; object-position: 50% ${Math.round((m.focusY ?? 0.3) * 100)}%"></div>`
    : `<div class="media" id="video" style="height:${boxH}px; background:#000"></div>`;
  const quote = s.quote
    ? `<figure class="quote">${s.quote.photo ? `<img src="${src(s.quote.photo)}">` : ""}<div><blockquote data-fit="58,34,7">“${marks(s.quote.text)}”</blockquote>
       <figcaption><b>${esc(s.quote.who)}</b>${s.quote.role ? ` · ${esc(s.quote.role)}` : ""}</figcaption></div></figure>`
    : "";
  const statPx = s.stat ? Math.min(250, Math.round(1600 / Math.max(3, [...s.stat.value].length))) : 0;
  const stat = s.stat ? `<div class="stat"><div class="v" style="font-size:${statPx}px">${esc(s.stat.value)}</div><div class="l">${esc(s.stat.label)}</div></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #fff; color: #0b0c0c; display: flex; flex-direction: column; justify-content: center; padding-bottom: 40px; }
.lead { padding: 0 56px 46px; font: 500 50px/1.26 Inter; letter-spacing: -.015em; max-height: 560px; }
.lead em { font-style: normal; font-weight: 800; }
.media { width: 100%; position: relative; overflow: hidden; }
.media img { width: 100%; height: 100%; display: block; }
.framed { margin: 0 30px; padding: 22px 24px; background: #fff; border: 2px solid #e4e4df; border-radius: 26px; box-shadow: 0 22px 60px rgba(0,0,0,.10); max-height: 780px; overflow: hidden; }
.framed img { width: 100%; display: block; }
.quote { margin: 0 56px; display: flex; gap: 30px; align-items: flex-start; padding: 44px 46px; background: #f3f3ef; border-radius: 26px; border-left: 10px solid ${GREEN}; }
.quote img { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; flex: none; }
.quote > div { flex: 1; min-width: 0; }
blockquote { font: 700 52px/1.18 Inter; letter-spacing: -.015em; max-height: 560px; }
blockquote em { font-style: normal; background: linear-gradient(transparent 62%, rgba(0,193,106,.35) 62%); }
figcaption { margin-top: 22px; font: 500 28px/1.3 Inter; color: #55554f; }
figcaption b { color: #0b0c0c; font-weight: 700; }
.stat { margin: 0 56px; padding: 50px 50px 54px; background: #070808; color: #fff; border-radius: 26px; }
.stat .v { font-family: Anton; line-height: 1.15; white-space: nowrap; overflow: hidden; color: ${GREEN}; }
.stat .l { margin-top: 18px; font: 600 36px/1.25 Inter; color: #e8e8e4; }
</style></head><body>
<div class="lead" data-fit="56,38,7">${marks(s.text)}</div>
${media}${quote}${stat}
${FIT}</body></html>`;
}

export type End = { type: "end"; line: string; sub: string; shot?: string };

/** The fixed last slide: the line, the sub-line, and tradr.me shown as the real website in a browser window. */
export function endHtml(s: End) {
  const shot = s.shot ?? path.join(import.meta.dirname, "assets", "tradr-site.png");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #070808; color: #fff; }
.glow { position: absolute; inset: 0; background: radial-gradient(70% 45% at 50% 78%, rgba(0,193,106,.28), transparent 70%); }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 90px 90px; mask-image: linear-gradient(180deg, transparent, #000 40%, #000 70%, transparent); }
.top { position: absolute; left: 44px; right: 44px; top: 70px; text-align: center; }
h2 { font-family: Anton; font-weight: 400; text-transform: uppercase; line-height: .95; letter-spacing: -.003em; text-wrap: balance; }
h2 em { font-style: normal; color: ${GREEN}; }
p { margin-top: 26px; font: 500 38px/1.3 Inter; color: #c9c9c2; text-wrap: balance; }
.win { position: absolute; left: 64px; right: 64px; bottom: 0; height: 830px; border-radius: 26px 26px 0 0; overflow: hidden; background: #0f1111;
  border: 2px solid rgba(255,255,255,.14); border-bottom: 0; box-shadow: 0 -10px 90px rgba(0,193,106,.25), 0 40px 80px rgba(0,0,0,.6); }
.bar { height: 92px; display: flex; align-items: center; gap: 22px; padding: 0 28px; background: #1a1c1c; border-bottom: 1px solid rgba(255,255,255,.08); }
.dots { display: flex; gap: 12px; } .dots i { width: 20px; height: 20px; border-radius: 50%; background: #3a3d3d; }
.url { flex: 1; height: 58px; border-radius: 999px; background: #070808; display: flex; align-items: center; justify-content: center; gap: 14px; font: 700 34px/1 Inter; letter-spacing: .005em; color: #fff; }
.url svg { width: 22px; height: 26px; }
.url .lock { width: 20px; height: 24px; opacity: .6; }
.page { position: absolute; top: 92px; left: 0; right: 0; bottom: 0; background: url('${src(shot)}') top center / 100% auto no-repeat; background-color: #00C16A; }
</style></head><body><div class="glow"></div><div class="grid"></div>
<div class="top"><h2 data-fit="118,70,3">${marks(s.line)}</h2><p>${esc(s.sub)}</p></div>
<div class="win"><div class="bar"><div class="dots"><i></i><i></i><i></i></div>
<div class="url"><svg class="lock" viewBox="0 0 20 24"><path fill="#fff" d="M4 10V7a6 6 0 0 1 12 0v3h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1Zm3 0h6V7a3 3 0 0 0-6 0v3Z"/></svg>tradr.me</div><div style="width:84px"></div></div>
<div class="page"></div></div>
${FIT}</body></html>`;
}

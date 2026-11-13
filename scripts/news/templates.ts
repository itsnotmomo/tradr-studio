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
.brand { position: absolute; top: 54px; left: 60px; display: flex; align-items: center; gap: 14px; z-index: 10; }
.brand svg { width: 34px; height: 38px; }
.brand span { font: 800 26px/1 Inter; letter-spacing: .14em; text-transform: uppercase; }
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
document.fonts.ready.then(() => {
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
  tag: string;
  photo?: string;
  /** cutout = subject lifted onto a dark, blurred version of the same photo; photo = full-bleed photo;
   *  chart = real market data drawn as a line (stories with no person, e.g. a price move). */
  mode?: "cutout" | "photo" | "chart";
  /** chart mode: closes oldest → newest, the big price label, the change chip and the data note (source + time) */
  chart?: { points: number[]; price: string; change: string; note: string; down?: boolean };
  /** cutout file (set by render.ts) */
  cutout?: string;
  /** 0–1, which part of the photo stays in frame vertically (photo mode) */
  focusY?: number;
  /** cutout: height of the subject as a share of the slide (default 0.86) and horizontal offset in px */
  scale?: number;
  offsetX?: number;
  credit?: string;
};

function chartSvg(c: NonNullable<Hook["chart"]>) {
  const p = c.points, lo = Math.min(...p), hi = Math.max(...p), w = W, h = 520, top = 20, bot = 40;
  const x = (i: number) => (i / (p.length - 1)) * (w - 16);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (h - top - bot);
  const line = p.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const col = c.down === false ? GREEN : RED;
  return `<div class="chart" style="background: radial-gradient(70% 50% at 50% 35%, ${col}22, transparent 70%), #0b0c0c">
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".38"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
<path d="${line}L${w},${h}L0,${h}Z" fill="url(#g)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="6" stroke-linejoin="round"/>
<circle cx="${x(p.length - 1) - 16}" cy="${y(p[p.length - 1])}" r="12" fill="${col}"/></svg>
<div class="px"><b>${esc(c.price)}</b><span style="background:${col}; color:${c.down === false ? "#0b0c0c" : "#fff"}">${esc(c.change)}</span></div>
<div class="cnote">${esc(c.note)}</div></div>`;
}

export function hookHtml(s: Hook) {
  const breaking = /^breaking/i.test(s.tag);
  const fy = Math.round((s.focusY ?? 0.25) * 100);
  const scale = s.scale ?? 0.86;
  const bg = s.mode === "chart" && s.chart ? chartSvg(s.chart) : s.mode === "cutout" && s.cutout
    ? `<div class="bgblur" style="background-image:url('${src(s.photo!)}')"></div><div class="glow"></div>
       <img class="cut" src="${src(s.cutout)}" style="height:${Math.round(H * scale)}px; transform: translateX(calc(-50% + ${s.offsetX ?? 0}px))">`
    : `<div class="full" style="background-image:url('${src(s.photo!)}'); background-position: 50% ${fy}%"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #0b0c0c; color: #fff; }
.full { position: absolute; inset: 0; background-size: cover; }
.bgblur { position: absolute; inset: -60px; background: center/cover; filter: blur(34px) saturate(.9) brightness(.42); }
.glow { position: absolute; inset: 0; background: radial-gradient(60% 45% at 50% 38%, rgba(0,193,106,.20), transparent 70%); }
.cut { position: absolute; bottom: 0; left: 50%; width: auto; filter: drop-shadow(0 20px 50px rgba(0,0,0,.55)); }
.fade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 16%, rgba(0,0,0,0) 44%, rgba(8,9,9,.80) 64%, #080909 84%); }
.text { position: absolute; left: 56px; right: 56px; bottom: 92px; display: flex; flex-direction: column; align-items: center; gap: 26px; }
.tag { font: 800 27px/1 Inter; letter-spacing: .16em; text-transform: uppercase; padding: 13px 20px 12px 18px; border-radius: 6px; display: inline-flex; align-items: center; gap: 12px;
  background: ${breaking ? RED : "#fff"}; color: ${breaking ? "#fff" : "#0b0c0c"}; }
.tag i { width: 12px; height: 12px; border-radius: 50%; background: ${breaking ? "#fff" : GREEN}; }
h1 { font-family: Anton; font-weight: 400; text-transform: uppercase; text-align: center; line-height: .98; width: 100%; letter-spacing: .005em; text-wrap: balance; }
h1 em { font-style: normal; color: ${s.mode === "chart" && s.chart?.down !== false ? RED : GREEN}; }
.credit { position: absolute; right: 26px; bottom: 22px; font: 500 15px/1 Inter; color: rgba(255,255,255,.42); }
.brand span { color: #fff; }
.chart { position: absolute; inset: 0; }
.chart svg { position: absolute; left: 0; top: 330px; width: 100%; height: 520px; }
.px { position: absolute; left: 60px; top: 150px; display: flex; align-items: baseline; gap: 18px; }
.px b { font: 400 112px/1 Anton; letter-spacing: .01em; }
.px span { font: 800 34px/1 Inter; padding: 10px 16px; border-radius: 10px; }
.cnote { position: absolute; left: 60px; top: 282px; font: 500 22px/1.2 Inter; color: rgba(255,255,255,.55); }
</style></head><body>
${bg}${s.mode === "chart" ? "" : '<div class="fade"></div>'}
<div class="brand">${MARK}<span>Tradr News</span></div>
<div class="text"><div class="tag"><i></i>${esc(s.tag)}</div><h1 data-fit="150,78,3">${marks(s.headline)}</h1></div>
${s.credit ? `<div class="credit">${esc(s.credit)}</div>` : ""}
${FIT}</body></html>`;
}

export type Card = {
  type: "card";
  /** The line at the top. Plain English, one or two sentences. */
  text: string;
  media?:
    | { kind: "image"; src: string; fit?: "cover" | "contain"; aspect?: number; bg?: string; focusY?: number; framed?: boolean }
    | { kind: "video"; src: string; aspect?: number; start?: string; end?: string; page?: string };
  quote?: { text: string; who: string; role?: string; photo?: string };
  stat?: { value: string; label: string };
  /** Small line at the bottom, e.g. "Source: Reuters" */
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
    ? `<div class="media" style="height:${boxH}px; background:${m.bg ?? (m.fit === "contain" ? "#eeeeea" : "#111")}"><img src="${src(m.src)}" style="object-fit:${m.fit ?? "cover"}; object-position: 50% ${Math.round((m.focusY ?? 0.3) * 100)}%"></div>`
    : `<div class="media" id="video" style="height:${boxH}px; background:#000"></div>`;
  const quote = s.quote
    ? `<figure class="quote">${s.quote.photo ? `<img src="${src(s.quote.photo)}">` : ""}<div><blockquote data-fit="58,34,7">“${marks(s.quote.text)}”</blockquote>
       <figcaption><b>${esc(s.quote.who)}</b>${s.quote.role ? ` · ${esc(s.quote.role)}` : ""}</figcaption></div></figure>`
    : "";
  const statPx = s.stat ? Math.min(230, Math.round(1500 / Math.max(3, [...s.stat.value].length))) : 0;
  const stat = s.stat ? `<div class="stat"><div class="v" style="font-size:${statPx}px">${esc(s.stat.value)}</div><div class="l">${esc(s.stat.label)}</div></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #fff; color: #0b0c0c; display: flex; flex-direction: column; justify-content: center; }
.brand span { color: #0b0c0c; }
.lead { padding: 0 60px 44px; font: 500 46px/1.28 Inter; letter-spacing: -.012em; }
.lead em { font-style: normal; font-weight: 800; }
.media { width: 100%; position: relative; overflow: hidden; }
.media img { width: 100%; height: 100%; display: block; }
.framed { margin: 0 60px; padding: 34px 36px; background: #fff; border: 2px solid #e6e6e1; border-radius: 22px; box-shadow: 0 18px 50px rgba(0,0,0,.08); }
.framed img { width: 100%; display: block; }
.quote { margin: 0 60px; display: flex; gap: 30px; align-items: flex-start; padding: 44px 46px; background: #f3f3ef; border-radius: 24px; border-left: 10px solid ${GREEN}; }
.quote img { width: 116px; height: 116px; border-radius: 50%; object-fit: cover; flex: none; }
.quote > div { flex: 1; min-width: 0; }
blockquote { font: 700 52px/1.18 Inter; letter-spacing: -.015em; max-height: 560px; }
blockquote em { font-style: normal; background: linear-gradient(transparent 62%, rgba(0,193,106,.35) 62%); }
figcaption { margin-top: 22px; font: 500 28px/1.3 Inter; color: #55554f; }
figcaption b { color: #0b0c0c; font-weight: 700; }
.stat { margin: 0 60px; padding: 46px 46px 50px; background: #0b0c0c; color: #fff; border-radius: 24px; }
.stat .v { font-family: Anton; line-height: 1.2; white-space: nowrap; overflow: hidden; color: ${GREEN}; }
.stat .l { margin-top: 18px; font: 600 34px/1.25 Inter; color: #e8e8e4; }
.foot { position: absolute; left: 60px; right: 60px; bottom: 50px; display: flex; justify-content: space-between; gap: 20px; font: 500 22px/1.3 Inter; color: #8a8a83; }
</style></head><body>
<div class="brand">${MARK}<span>Tradr News</span></div>
<div class="lead" data-fit="54,36,6">${marks(s.text)}</div>
${media}${quote}${stat}
<div class="foot"><span>${s.source ? esc(s.source) : ""}</span><span>${s.credit ? esc(s.credit) : ""}</span></div>
${FIT}</body></html>`;
}

export type End = { type: "end"; line: string; sub: string };

/** The fixed last slide. */
export function endHtml(s: End) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #0b0c0c; color: #fff; }
.glow { position: absolute; inset: 0; background: radial-gradient(55% 40% at 50% 46%, rgba(0,193,106,.16), transparent 72%); }
.c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 90px; gap: 40px; }
.c svg { width: 96px; height: 107px; }
h2 { font-family: Anton; font-weight: 400; text-transform: uppercase; font-size: 104px; line-height: 1; letter-spacing: .005em; text-wrap: balance; }
h2 em { font-style: normal; color: ${GREEN}; }
p { font: 500 36px/1.35 Inter; color: #b9b9b2; max-width: 820px; text-wrap: balance; }
.url { margin-top: 10px; font: 800 40px/1 Inter; letter-spacing: .02em; color: #0b0c0c; background: ${GREEN}; padding: 22px 38px; border-radius: 999px; }
</style></head><body><div class="glow"></div>
<div class="c">${MARK}<h2 data-fit="110,70,3">${marks(s.line)}</h2><p>${esc(s.sub)}</p><div class="url">tradr.me</div></div>
${FIT}</body></html>`;
}

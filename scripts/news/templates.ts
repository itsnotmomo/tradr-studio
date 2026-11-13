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
    const W = el.clientWidth, H = el.clientHeight, nw = im.naturalWidth, nh = im.naturalHeight;
    const cov = Math.max(W / nw, H / nh);
    if (el.dataset.face) {
      const [fx, fy, fw, fh, fs, cx, cy] = el.dataset.face.split(',').map(Number);
      const r = Math.max(cov, (W * fs) / (fw * nw)), bw = nw * r, bh = nh * r;
      const px = Math.min(0, Math.max(W - bw, W * cx - (fx + fw / 2) * bw));
      const py = Math.min(0, Math.max(H - bh, H * cy - (fy + fh / 2) * bh));
      el.style.backgroundSize = Math.round(bw) + 'px ' + Math.round(bh) + 'px';
      el.style.backgroundPosition = Math.round(px) + 'px ' + Math.round(py) + 'px'; ok(); return;
    }
    const r = cov * z;
    el.style.backgroundSize = Math.round(nw * r) + 'px ' + Math.round(nh * r) + 'px'; ok();
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
  /** photo mode: the face box in the photo (fractions, top-left origin; render.ts finds it with Apple Vision).
   *  The photo is scaled so the face is `faceSize` of the slide width (default 0.5) with its centre at `faceAt`
   *  (default [0.5, 0.34]): tight, eyes in the top third, clear of the headline. */
  face?: { x: number; y: number; w: number; h: number } | null;
  faceSize?: number;
  faceAt?: [number, number];
  /** photo mode without a face: zoom (1 = cover) and the point of the photo kept in frame (0–1). */
  zoom?: number;
  focusX?: number;
  focusY?: number;
  /** cutout: height of the subject as a share of the slide (default 0.86) and horizontal offset in px */
  scale?: number;
  offsetX?: number;
  /** A second person or a logo in a white-ringed circle (Polymarket's Musk/GOP layout). */
  inset?: { src?: string; tile?: { label: string; value: string; down?: boolean }; x?: number; y?: number; size?: number; zoom?: number; focusX?: number; focusY?: number; bg?: string };
  /** Colour of the *highlighted* words: green (default; gains, the news itself) or red (losses, falls). */
  accent?: "green" | "red";
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
    : `<div class="full" data-cover="${s.zoom ?? 1}"${s.face ? ` data-face="${[s.face.x, s.face.y, s.face.w, s.face.h, s.faceSize ?? 0.5, ...(s.faceAt ?? [0.5, 0.34])].join(",")}"` : ""} style="${bgImg(s.photo!, 1, s.focusX ?? 0.5, s.focusY ?? 0.25)}"></div>`;
  const i = s.inset;
  const inset = i?.tile
    ? `<div class="inset tile ${i.tile.down ? "dn" : "upx"}" style="left:${i.x ?? 640}px; top:${i.y ?? 200}px; width:${i.size ?? 300}px; height:${i.size ?? 300}px"><b>${esc(i.tile.label)}</b><span>${esc(i.tile.value)}</span></div>`
    : i?.src
    ? `<div class="inset" data-cover="${i.zoom ?? 1}" style="left:${i.x ?? 640}px; top:${i.y ?? 200}px; width:${i.size ?? 360}px; height:${i.size ?? 360}px; background-color:${i.bg ?? "#fff"}; ${bgImg(i.src!, 1, i.focusX ?? 0.5, i.focusY ?? 0.3)}"></div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #070808; color: #fff; }
.full { position: absolute; inset: 0; background-repeat: no-repeat; }
.bgblur { position: absolute; inset: -60px; background: center/cover; filter: blur(30px) saturate(.95) brightness(.5); }
.cut { position: absolute; bottom: 0; left: 50%; width: auto; }
.fade { position: absolute; left: 0; right: 0; bottom: 0; height: 62%; background: linear-gradient(180deg, rgba(7,8,8,0) 0%, rgba(7,8,8,.55) 30%, rgba(7,8,8,.92) 58%, #070808 80%); }
.topfade { position: absolute; left: 0; right: 0; top: 0; height: 200px; background: linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0)); }
.inset { position: absolute; border-radius: 50%; border: 9px solid #fff; background-repeat: no-repeat; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
.inset.tile { display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; gap: 6px; }
.inset.tile.dn { background: radial-gradient(circle at 30% 25%, #ff5257, #c3161b 70%); }
.inset.tile.upx { background: radial-gradient(circle at 30% 25%, #2ee08e, #00a85a 70%); }
.inset.tile b { font: 800 40px/1 Inter; letter-spacing: .04em; }
.inset.tile span { font: 400 76px/1 Anton; }
.text { position: absolute; left: 34px; right: 34px; bottom: 58px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
.tag { font: 400 40px/1 Anton; letter-spacing: .01em; text-transform: uppercase; padding: 12px 20px 11px; border-radius: 10px;
  background: #fff; color: #070808; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.tag.br { background: ${RED}; color: #fff; border: 3px solid #fff; padding: 9px 17px 8px; }
.tag.q { background: ${GREEN}; color: #070808; padding: 14px 26px; display: flex; }
.tag.q svg { width: 62px; height: 42px; }
h1 { font-family: Anton; font-weight: 400; text-transform: uppercase; text-align: center; line-height: .93; width: 100%; letter-spacing: -.003em; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.4); }
h1 em { font-style: normal; color: ${s.accent === "red" || (s.accent !== "green" && s.mode === "chart" && s.chart?.down !== false) ? "#ff3b40" : GREEN}; }
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
  /** One figure as a bold market tile: red for losses/falls, green for gains/rises, dark for neutral. */
  stat?: { value: string; label: string; tone?: "up" | "down" | "neutral" };
  /** Real price data drawn as a chart panel (oldest → newest closes). */
  chart?: { points: number[]; title: string; price: string; change: string; note: string; down?: boolean; mark?: { at: number; label: string } };
  /** 2–4 market tiles, e.g. the moves of several assets. */
  tiles?: { label: string; value: string; change?: string; tone?: "up" | "down" | "neutral" }[];
  /** Kept in Studio only (sources[]); never drawn on the slide. */
  source?: string;
  credit?: string;
};

function cardChart(c: NonNullable<Card["chart"]>) {
  const p = c.points, lo = Math.min(...p), hi = Math.max(...p), w = 1000, h = 420, top = 30, bot = 70;
  const x = (i: number) => 20 + (i / (p.length - 1)) * (w - 70);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (h - top - bot);
  const line = p.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const col = c.down ? RED : GREEN;
  const m = c.mark ? `<line x1="${x(c.mark.at)}" x2="${x(c.mark.at)}" y1="${top - 10}" y2="${h - bot + 10}" stroke="#fff" stroke-opacity=".5" stroke-dasharray="6 8" stroke-width="3"/>
<rect x="${x(c.mark.at) - 8}" y="${top - 26}" rx="10" width="${c.mark.label.length * 15 + 30}" height="40" fill="#fff"/><text x="${x(c.mark.at) + 7}" y="${top + 2}" font-family="Inter" font-weight="800" font-size="24" fill="#0b0c0c">${esc(c.mark.label)}</text>` : "";
  return `<div class="cchart"><div class="ct">${esc(c.title)}</div><div class="cp"><b>${esc(c.price)}</b><span style="background:${col}; color:#fff">${esc(c.change)}</span></div>
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".4"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
<path d="${line}L${x(p.length - 1)},${h}L${x(0)},${h}Z" fill="url(#cg)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="6" stroke-linejoin="round"/>${m}
<circle cx="${x(p.length - 1)}" cy="${y(p[p.length - 1])}" r="12" fill="${col}"/></svg><div class="cn">${esc(c.note)}</div></div>`;
}

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
  const statPx = s.stat ? Math.min(300, Math.round(1750 / Math.max(3, [...s.stat.value].length))) : 0;
  const tone = (t?: string) => (t === "up" ? "up" : t === "down" ? "down" : "neutral");
  const stat = s.stat ? `<div class="stat ${tone(s.stat.tone)}"><div class="v" style="font-size:${statPx}px">${esc(s.stat.value)}</div><div class="l">${esc(s.stat.label)}</div></div>` : "";
  const tiles = s.tiles?.length ? `<div class="tiles n${s.tiles.length}">${s.tiles.map((t) => `<div class="tile ${tone(t.tone)}"><div class="tl">${esc(t.label)}</div><div class="tv">${esc(t.value)}</div>${t.change ? `<div class="tc">${t.tone === "down" ? "▼" : t.tone === "up" ? "▲" : ""} ${esc(t.change)}</div>` : ""}</div>`).join("")}</div>` : "";
  const chart = s.chart ? cardChart(s.chart) : "";
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
.stat { margin: 0 40px; padding: 46px 52px 54px; border-radius: 30px; color: #fff; position: relative; overflow: hidden; box-shadow: 0 30px 60px -24px rgba(0,0,0,.35); }
.stat::after { content: ""; position: absolute; inset: 0; background: radial-gradient(90% 70% at 85% 0%, rgba(255,255,255,.22), transparent 60%); }
.stat.up { background: linear-gradient(160deg, #10d27a, #00a85a); }
.stat.down { background: linear-gradient(160deg, #f0383d, #c3161b); }
.stat.neutral { background: linear-gradient(160deg, #1b1e1e, #070808); }
.stat .v { font-family: Anton; line-height: 1.1; white-space: nowrap; letter-spacing: -.005em; position: relative; z-index: 1; }
.stat.neutral .v { color: ${GREEN}; }
.stat .l { margin-top: 14px; font: 700 38px/1.22 Inter; color: rgba(255,255,255,.94); position: relative; z-index: 1; }
.tiles { margin: 0 40px; display: grid; gap: 18px; grid-template-columns: repeat(2, 1fr); }
.tiles.n3 { grid-template-columns: repeat(3, 1fr); }
.tile { border-radius: 28px; padding: 38px 34px 40px; min-height: 330px; display: flex; flex-direction: column; justify-content: space-between; color: #fff; box-shadow: 0 24px 50px -24px rgba(0,0,0,.35); }
.tile.up { background: linear-gradient(160deg, #10d27a, #00a85a); }
.tile.down { background: linear-gradient(160deg, #f0383d, #c3161b); }
.tile.neutral { background: #0b0c0c; }
.tile .tl { font: 800 30px/1.1 Inter; letter-spacing: .02em; text-transform: uppercase; opacity: .92; }
.tile .tv { margin-top: 26px; font: 400 128px/1 Anton; letter-spacing: -.005em; white-space: nowrap; }
.tiles.n3 .tile .tv { font-size: 92px; }
.tiles.n3 .tile { padding: 34px 26px 36px; }
.tile .tc { margin-top: 16px; font: 800 32px/1 Inter; }
.cchart { margin: 0 40px; border-radius: 30px; background: #0b0c0c; color: #fff; padding: 36px 0 0; overflow: hidden; position: relative; box-shadow: 0 30px 60px -24px rgba(0,0,0,.35); }
.cchart .ct { padding: 0 40px; font: 800 28px/1 Inter; letter-spacing: .04em; text-transform: uppercase; color: rgba(255,255,255,.6); }
.cchart .cp { padding: 14px 40px 0; display: flex; align-items: center; gap: 18px; }
.cchart .cp b { font: 400 104px/1 Anton; }
.cchart .cp span { font: 800 34px/1 Inter; padding: 10px 16px; border-radius: 12px; }
.cchart svg { display: block; width: 100%; height: 420px; margin-top: 10px; }
.cchart .cn { position: absolute; left: 40px; bottom: 24px; font: 500 22px/1.2 Inter; color: rgba(255,255,255,.5); }
</style></head><body>
<div class="lead" data-fit="56,38,7">${marks(s.text)}</div>
${media}${quote}${stat}${tiles}${chart}
${FIT}</body></html>`;
}

export type End = { type: "end"; line: string; sub: string };

type FeedPost = { who: string; name: string; face: string; time: string; note: string; market: string; side: "Buy" | "Sell"; res: string; rr: string; likes: string; comments: string; saves: string; path: number[] };

/** Made-up traders and made-up trades for the marketing phone (never real users or their results).
 *  Faces: free-licence stock portraits from the tradr.me landing set (Unsplash), names invented. */
const FEED: FeedPost[] = [
  { who: "marcus", name: "Marcus Cole", face: "marcus.webp", time: "2h", note: "Waited three sessions for this retest. London open delivered, out at the second target.", market: "XAU/USD", side: "Buy", res: "+6.42%", rr: "1 : 3.8", likes: "2.4k", comments: "318", saves: "906",
    path: [10, 12, 11, 14, 13, 15, 14, 18, 17, 21, 20, 24, 23, 27, 30, 29, 33, 36, 35, 39, 42] },
  { who: "elena", name: "Elena Petrova", face: "elena.webp", time: "5h", note: "Short from the range high, held through the flush. Partials at TP1 and TP2.", market: "BTC/USD", side: "Sell", res: "+4.85%", rr: "1 : 2.9", likes: "1.9k", comments: "241", saves: "712",
    path: [40, 41, 39, 42, 38, 37, 39, 35, 33, 34, 30, 28, 29, 25, 22, 23, 19, 17, 18, 14, 12] },
  { who: "tobi", name: "Tobi Adeyemi", face: "tobi.webp", time: "8h", note: "Clean break of the weekly level. Risked 1%, closed the week green.", market: "EUR/USD", side: "Buy", res: "+3.12%", rr: "1 : 3.1", likes: "1.2k", comments: "164", saves: "433",
    path: [12, 13, 12, 15, 16, 15, 18, 19, 21, 20, 23, 25, 24, 27, 29, 31, 30, 33, 35, 36, 38] },
];

const ICO = {
  heart: "M12 21s-7.5-4.6-9.5-9.2C1 8.4 3.4 5 6.9 5c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.5 0 5.9 3.4 4.4 6.8C19.5 16.4 12 21 12 21Z",
  chat: "M4 5h16v11H9l-5 4V5Z",
  save: "M6 3h12v18l-6-4-6 4V3Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5.2 12.2L21 21",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4",
  home: "M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z",
  trophy: "M7 4h10v4a5 5 0 0 1-10 0V4Zm5 9v4m-4 3h8M7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0M17 3a4 4 0 0 1 0 8m5 9a7 7 0 0 0-4-6.3",
  user: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-8 10a8 8 0 0 1 16 0",
};
const ico = (d: string, fill = false) => `<svg viewBox="0 0 24 24" class="i"><path d="${d}" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function spark(p: number[], up: boolean) {
  const lo = Math.min(...p), hi = Math.max(...p), w = 300, h = 74;
  const pts = p.map((v, i) => `${((i / (p.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8)).toFixed(1)}`);
  const col = "#00D478";
  void up;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="sp"><defs><linearGradient id="sg${p[0]}${p[1]}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
<path d="M${pts.join("L")}L${w},${h}L0,${h}Z" fill="url(#sg${p[0]}${p[1]})"/><path d="M${pts.join("L")}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

function postHtml(t: FeedPost) {
  const face = src(path.join(import.meta.dirname, "assets", "faces", t.face));
  return `<article class="post"><header><img src="${face}"><p><b>${esc(t.name)}</b><em>${esc(t.res)}</em></p><time>${esc(t.time)}</time></header>
<div class="note">${esc(t.note)}</div>
<div class="row"><div class="pair"><span class="mk">${esc(t.market)}</span><span class="side ${t.side === "Buy" ? "b" : "s"}">${t.side}</span><span class="rr">R:R ${esc(t.rr)}</span></div><div class="res">${esc(t.res)}</div></div>
<div class="chart">${spark(t.path, t.side === "Buy")}</div>
<footer><span>${ico(ICO.heart, true)}${t.likes}</span><span>${ico(ICO.chat)}${t.comments}</span><span>${ico(ICO.save)}${t.saves}</span></footer></article>`;
}

/** The fixed last slide: the line, the sub-line, tradr.me, and an iPhone showing the Tradr feed (made-up traders). */
export function endHtml(s: End) {
  const me = src(path.join(import.meta.dirname, "assets", "faces", "luke.webp"));
  const [l1, l2] = s.line.replace(/\*/g, "").split(/,\s*/);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
@font-face { font-family: Display; src: url(${f("archivo-condensed-black-italic.woff2")}); font-weight: 900; font-style: italic; }
@font-face { font-family: Geist; src: url(${f("geist.woff2")}); font-weight: 400 700; }
body { background: #00C16A; color: #06100a; font-family: Geist, Inter, sans-serif; }
.bg { position: absolute; inset: 0; background: radial-gradient(60% 40% at 50% 85%, rgba(255,255,255,.28), transparent 70%), radial-gradient(80% 60% at 0% 0%, rgba(0,0,0,.10), transparent 60%); }
.hd { position: absolute; left: 60px; right: 60px; top: 60px; }
h2 { font-family: Display; font-weight: 900; font-style: italic; text-transform: uppercase; line-height: .9; letter-spacing: -.01em; }
h2 span { display: block; white-space: nowrap; }
h2 .a { color: rgba(6,16,10,.42); }
h2 .b { color: #06100a; }
.subrow { margin-top: 30px; display: flex; align-items: center; justify-content: space-between; gap: 30px; }
.sub { font: 500 34px/1.25 Geist; color: #06100a; max-width: 560px; }
.url { flex: none; display: flex; align-items: center; gap: 14px; background: #06100a; color: #fff; font: 700 42px/1 Geist; letter-spacing: -.01em; padding: 22px 34px 22px 26px; border-radius: 999px; box-shadow: 0 18px 40px -12px rgba(0,0,0,.45); }
.url svg { width: 30px; height: 34px; }
/* iPhone 18 Pro */
.phone { position: absolute; left: 50%; top: 392px; width: 640px; height: 1300px; margin-left: -320px; border-radius: 98px; padding: 14px;
  background: linear-gradient(145deg, #4a4f53, #1c1f21 30%, #2e3235 60%, #121415); box-shadow: 0 70px 120px -30px rgba(0,40,20,.65), 0 30px 60px -20px rgba(0,0,0,.5), inset 0 0 0 2px rgba(255,255,255,.12); }
.phone::before { content: ""; position: absolute; right: -6px; top: 300px; width: 6px; height: 120px; border-radius: 0 4px 4px 0; background: #2a2e30; }
.scr { position: relative; width: 100%; height: 100%; border-radius: 85px; overflow: hidden; background: #000; color: #e7eaeb; display: flex; flex-direction: column; font-family: Geist, Inter, sans-serif; }
.island { position: absolute; top: 20px; left: 50%; width: 150px; height: 44px; margin-left: -75px; border-radius: 30px; background: #000; box-shadow: 0 0 0 1px #111; z-index: 3; }
.sb { height: 84px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 14px 58px 0 66px; font: 700 27px/1 Geist; color: #fff; }
.sb i { display: inline-block; width: 40px; height: 18px; border-radius: 6px; border: 2px solid rgba(255,255,255,.55); position: relative; }
.sb i::after { content: ""; position: absolute; inset: 2px 6px 2px 2px; border-radius: 3px; background: #fff; }
.top { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 14px; }
.top img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; }
.top .t { width: 40px; height: 45px; }
.top .r { display: flex; gap: 22px; color: #9aa3a7; }
.i { width: 34px; height: 34px; }
.tabs { flex: none; display: flex; border-bottom: 1px solid #1a1f22; font: 600 25px/1 Geist; color: #737c80; }
.tabs span { flex: 1; text-align: center; padding: 14px 0 20px; position: relative; }
.tabs .on { color: #fff; }
.tabs .on::after { content: ""; position: absolute; left: 50%; bottom: 0; width: 90px; height: 5px; margin-left: -45px; border-radius: 4px; background: #00C16A; }
.feed { flex: 1; padding: 18px 18px 0; display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
.post { border: 1.5px solid #1c2225; border-radius: 28px; padding: 22px 24px 18px; background: #050707; }
.post header { display: flex; align-items: center; gap: 14px; }
.post header img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
.post header p { flex: 1; display: flex; align-items: baseline; gap: 12px; }
.post header b { font: 700 26px/1 Geist; color: #fff; }
.post header em { font: 700 20px/1 Geist; font-style: normal; color: #00d478; }
.post time { font: 500 20px/1 Geist; color: #6b7478; }
.note { margin-top: 14px; font: 400 23px/1.36 Geist; color: #c5cbce; }
.row { margin-top: 16px; display: flex; align-items: center; justify-content: space-between; }
.pair { display: flex; align-items: center; gap: 12px; font: 700 23px/1 Geist; letter-spacing: .02em; color: #fff; }
.side { font: 800 17px/1 Geist; letter-spacing: .08em; text-transform: uppercase; padding: 7px 10px; border-radius: 8px; }
.side.b { color: #00d478; background: rgba(0,212,120,.12); } .side.s { color: #ff5a5f; background: rgba(255,90,95,.12); }
.res { font: 800 46px/1 Geist; letter-spacing: -.03em; color: #00d478; }
.chart { position: relative; margin-top: 12px; height: 74px; }
.sp { width: 100%; height: 74px; display: block; }
.rr { font: 600 19px/1 Geist; letter-spacing: 0; color: #8b9498; }
.post footer { margin-top: 14px; display: flex; gap: 34px; font: 600 21px/1 Geist; color: #8b9498; }
.post footer span { display: inline-flex; align-items: center; gap: 8px; }
.post footer span:first-child { color: #ff5a7a; }
.post footer .i { width: 27px; height: 27px; }
.post footer span:last-child { margin-left: auto; }
.chip { position: absolute; display: flex; align-items: center; gap: 12px; padding: 16px 22px; border-radius: 999px; background: #fff; color: #06100a; font: 700 26px/1 Geist; box-shadow: 0 24px 50px -14px rgba(0,40,20,.55); z-index: 5; }
.chip img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; }
.chip b { color: #00a85c; }
.chip .hrt { color: #ff4d6d; display: flex; } .chip .i { width: 32px; height: 32px; }
</style></head><body><div class="bg"></div>
<div class="hd"><h2><span class="a" data-fit="160,80,1">${esc(l1 ?? "")},</span><span class="b" data-fit="160,80,1">${esc(l2 ?? "")}</span></h2>
<div class="subrow"><p class="sub">${esc(s.sub)}</p><div class="url">${MARK}tradr.me</div></div></div>
<div class="phone"><div class="scr"><div class="island"></div>
<div class="sb"><span>9:41</span><span><i></i></span></div>
<div class="top"><img src="${me}"><div class="t">${MARK}</div><div class="r">${ico(ICO.search)}${ico(ICO.bell)}</div></div>
<div class="tabs"><span class="on">Discover</span><span>Trade Ideas</span></div>
<div class="feed">${FEED.map(postHtml).join("")}</div></div></div>
${FIT}</body></html>`;
}

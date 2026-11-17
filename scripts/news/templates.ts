// HTML for every News slide (1080 × 1350). Rendered by headless Chrome in render.ts.
// Style rules live in the style guide (Studio → News → Style); keep this file in step with it.
import { pathToFileURL } from "node:url";
import path from "node:path";
import QRCode from "qrcode";

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

/** Safe area (Mohamed, 17 Nov 2026). Instagram's profile grid shows a 4:5 post (1080x1350) as a 3:4 centre crop, so
 *  about 34 px go off each side, and the view counter sits over the bottom strip. On the hook every word stays at
 *  least SAFE_X from the sides and SAFE_BOTTOM above the bottom edge; the slide itself stays 1080x1350. */
export const SAFE_X = 96;
export const SAFE_BOTTOM = 180;

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
    // "max,min,lines" or "max,min,lines,min2,lines2": the biggest size that fits in \`lines\`, else in \`lines2\`.
    const [max, min, lines, min2, lines2] = el.dataset.fit.split(',').map(Number);
    let s = fit(el, max, min, lines);
    const lh = () => parseFloat(getComputedStyle(el).lineHeight);
    if (lines2 && (el.scrollHeight > lh() * lines + 2 || el.scrollWidth > el.clientWidth + 1)) s = fit(el, min, min2, lines2);
    el.dataset.size = s;
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
  /** Headline size override, "max,min,lines[,min2,lines2]" (default "184,112,3,84,4"): e.g. a long headline that
   *  should fill 4 lines bigger than the default's 112 px cap. The text box stays inside the safe area either way. */
  fit?: string;
  /** Headline distance from the bottom edge in px (default SAFE_BOTTOM). Lower only on Mohamed's ask: under 180 the
   *  last line can sit under the grid's view counter. */
  bottom?: number;
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
${c.note ? `<div class="cnote">${esc(c.note)}</div>` : ""}</div>`;
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
    ? `<div class="inset tile ${i.tile.down ? "dn" : "upx"}" style="left:${i.x ?? 640}px; top:${i.y ?? 200}px; width:${i.size ?? 300}px; height:${i.size ?? 300}px"><b style="font-size:${Math.round((i.size ?? 300) * 0.13)}px">${esc(i.tile.label)}</b><span style="font-size:${Math.round((i.size ?? 300) * 0.25)}px">${esc(i.tile.value)}</span></div>`
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
.text { position: absolute; left: ${SAFE_X}px; right: ${SAFE_X}px; bottom: ${SAFE_BOTTOM}px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
.tag { font: 400 40px/1 Anton; letter-spacing: .01em; text-transform: uppercase; padding: 12px 20px 11px; border-radius: 10px;
  background: #fff; color: #070808; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.tag.br { background: ${RED}; color: #fff; border: 3px solid #fff; padding: 9px 17px 8px; }
.tag.q { background: ${GREEN}; color: #070808; padding: 14px 26px; display: flex; }
.tag.q svg { width: 62px; height: 42px; }
h1 { font-family: Anton; font-weight: 400; text-transform: uppercase; text-align: center; line-height: .93; width: 100%; letter-spacing: -.003em; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.4); }
h1 em { font-style: normal; color: ${s.accent === "red" || (s.accent !== "green" && s.mode === "chart" && s.chart?.down !== false) ? "#ff3b40" : GREEN}; }
.logo { position: absolute; top: 56px; left: ${SAFE_X - 12}px; width: 44px; height: 49px; z-index: 10; filter: drop-shadow(0 2px 10px rgba(0,0,0,.45)); }
.chart { position: absolute; inset: 0; }
.chart .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 108px 108px; }
.chart svg { position: absolute; left: 0; top: 330px; width: 100%; height: 640px; }
.px { position: absolute; left: ${SAFE_X}px; top: 150px; display: flex; align-items: center; gap: 22px; }
.px b { font: 400 150px/1 Anton; letter-spacing: .005em; }
.px span { font: 800 40px/1 Inter; padding: 12px 18px; border-radius: 12px; }
.cnote { position: absolute; left: ${SAFE_X + 2}px; top: 312px; font: 500 24px/1.2 Inter; color: rgba(255,255,255,.55); }
</style></head><body>
${bg}${inset}${s.mode === "chart" ? "" : '<div class="topfade"></div><div class="fade"></div>'}
<div class="logo">${MARK}</div>
<div class="text"${s.bottom != null ? ` style="bottom:${Math.round(s.bottom)}px"` : ""}>${tagHtml(s.tag)}<h1 data-fit="${esc(s.fit || "184,112,3,84,4")}">${marks(s.headline)}</h1></div>
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
  /** Polymarket layout (the default since 14 Nov 2026): off-white slide, the caption-like line on top, then rows of
   *  rounded visuals side by side (each row is an array of panels; panels in a row share its height). */
  rows?: Panel[][];
  /** Newspaper story (house format since 16 Nov 2026, after the orange-W carousels): one full-bleed visual (photo,
   *  big logo or big chart), a big bold title and 2–4 short lines underneath. *word* = Tradr green. */
  story?: Story;
  /** Set by render.ts: [position, count] among the story slides, drawn as the progress bar. */
  progress?: [number, number];
  /** Kept in Studio only (sources[]); never drawn on the slide. */
  source?: string;
  credit?: string;
};

export type Story = {
  title: string;
  body: string;
  /** Full-bleed photo / logo (zoom 1 = cover; focus = the point kept in frame, 0–1). */
  image?: string;
  zoom?: number;
  focusX?: number;
  focusY?: number;
  /** "width" = the whole image width shown (a wide logo or sign that cover would cut), anchored at the top. */
  fit?: "cover" | "width";
  /** Or a full-bleed chart from real data (oldest → newest), red when down. */
  chart?: { points: number[]; down?: boolean; mark?: { at: number; label: string }; end?: string };
  /** Colour of the *highlighted* words (default green). */
  accent?: "green" | "red";
};

function storyChart(c: NonNullable<Story["chart"]>) {
  const p = c.points, lo = Math.min(...p), hi = Math.max(...p), w = W, h = 700, top = 110, bot = 120;
  const x = (i: number) => 40 + (i / (p.length - 1)) * (w - 120);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (h - top - bot);
  const line = p.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const col = c.down === false ? GREEN : RED;
  const last = [x(p.length - 1), y(p[p.length - 1])];
  const mk = c.mark ? [x(c.mark.at), y(p[c.mark.at])] : null;
  return `<div class="sbg chartbg" style="background: radial-gradient(70% 50% at 60% 40%, ${col}33, transparent 70%), #070808"><div class="grid"></div>
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient><filter id="sgl"><feGaussianBlur stdDeviation="8"/></filter></defs>
<path d="${line}L${last[0]},${h}L${x(0)},${h}Z" fill="url(#sg)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="16" stroke-opacity=".45" filter="url(#sgl)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="7" stroke-linejoin="round"/>
${mk ? `<circle cx="${mk[0]}" cy="${mk[1]}" r="14" fill="#fff"/><circle cx="${mk[0]}" cy="${mk[1]}" r="30" fill="#fff" fill-opacity=".2"/>` : ""}
<circle cx="${last[0]}" cy="${last[1]}" r="13" fill="${col}"/></svg></div>
<div class="labels">${mk && c.mark ? `<div class="smk" style="left:${mk[0]}px; top:${mk[1] + 40}px">${esc(c.mark.label)}</div>` : ""}
${c.end ? `<div class="send" style="left:${last[0]}px; top:${last[1] - 130}px">${esc(c.end)}</div>` : ""}</div>`;
}

function storyHtml(s: Card) {
  const t = s.story!;
  const accent = t.accent === "red" ? "#ff3b40" : GREEN;
  const bg = t.chart ? storyChart(t.chart)
    : t.fit === "width"
    ? `<div class="sbg" style="background-image:url('${src(t.image!)}'); background-size: 100% auto; background-position: 50% 0; -webkit-mask-image: linear-gradient(180deg, #000 48%, transparent 76%)"></div>`
    : `<div class="sbg" data-cover="${t.zoom ?? 1}" style="${bgImg(t.image!, 1, t.focusX ?? 0.5, t.focusY ?? 0.4)}"></div>`;
  const [at, n] = s.progress ?? [0, 0];
  const bar = n >= 1 ? `<div class="prog">${Array.from({ length: n }, (_, i) => `<i class="${i === at ? "on" : ""}"></i>`).join("")}</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #070808; color: #fff; }
.sbg { position: absolute; left: 0; right: 0; top: 0; height: 900px; background-repeat: no-repeat; }
.chartbg { height: 900px; }
.chartbg .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 108px 108px; }
.chartbg svg { position: absolute; left: 0; top: 0; width: 100%; }
.smk, .send { position: absolute; transform: translateX(-50%); font: 800 40px/1 Inter; padding: 14px 20px; border-radius: 14px; white-space: nowrap; }
.smk { background: #fff; color: #070808; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
.labels { position: absolute; inset: 0; z-index: 3; }
.send { background: rgba(255,255,255,.12); color: #fff; border: 2px solid rgba(255,255,255,.25); transform: translateX(-85%); }
.shade { position: absolute; left: 0; right: 0; top: 380px; bottom: 0; background: linear-gradient(180deg, rgba(7,8,8,0) 0%, rgba(7,8,8,.7) 26%, rgba(7,8,8,.96) 46%, #070808 60%); }
.copy { position: absolute; left: 84px; right: 84px; bottom: 124px; }
h2 { font: 850 104px/1.0 Inter; letter-spacing: -.035em; text-wrap: balance; }
h2 em, p em { font-style: normal; color: ${accent}; }
hr { border: 0; height: 2px; background: rgba(255,255,255,.22); margin: 34px 0 30px; }
p { font: 500 41px/1.34 Inter; letter-spacing: -.012em; color: rgba(255,255,255,.9); text-wrap: pretty; }
p em { font-weight: 750; }
.prog { position: absolute; left: 84px; right: 84px; bottom: 56px; display: flex; gap: 14px; }
.prog i { flex: 1; height: 9px; border-radius: 9px; background: rgba(255,255,255,.28); }
.prog i.on { background: ${GREEN}; }
</style></head><body>
${bg}<div class="shade"></div>
<div class="copy"><h2 data-fit="112,72,2">${marks(t.title)}</h2><hr><p data-fit="44,34,5">${marks(t.body)}</p></div>
${bar}
${FIT}</body></html>`;
}

export type Panel =
  | { kind: "image"; src: string; h?: number; flex?: number; fit?: "cover" | "contain"; bg?: string; focusY?: number; pad?: number }
  | { kind: "chart"; h?: number; flex?: number; points: number[]; title: string; price: string; change: string; note: string; down?: boolean; mark?: { at: number; label: string } }
  | { kind: "tile"; h?: number; flex?: number; label: string; value: string; change?: string; tone?: "up" | "down" | "neutral" }
  | { kind: "bars"; h?: number; flex?: number; title: string; note?: string; bars: { label: string; value: number; text: string }[] };

function panelHtml(p: Panel, h: number | null) {
  const hs = h ? `height:${h}px;` : "";
  const fl = `flex:${p.flex ?? 1};`;
  if (p.kind === "image") {
    if (!h) return `<div class="pn img" style="${fl}${p.bg ? `background:${p.bg};` : ""}${p.pad ? `padding:${p.pad}px;` : ""}"><img src="${src(p.src)}" style="width:100%;height:auto"></div>`;
    return `<div class="pn img" style="${fl}${hs}background:${p.bg ?? (p.fit === "contain" ? "#fff" : "#111")};${p.pad ? `padding:${p.pad}px;` : ""}"><img src="${src(p.src)}" style="width:100%;height:100%;object-fit:${p.fit ?? "cover"};object-position:50% ${Math.round((p.focusY ?? 0.3) * 100)}%"></div>`;
  }
  if (p.kind === "chart") {
    const pts = p.points, lo = Math.min(...pts), hi = Math.max(...pts), w = 1000, ch = 400, top = 30, bot = 20;
    const x = (i: number) => 10 + (i / (pts.length - 1)) * (w - 50);
    const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (ch - top - bot);
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const col = p.down ? RED : GREEN;
    const m = p.mark ? `<line x1="${x(p.mark.at)}" x2="${x(p.mark.at)}" y1="${top - 10}" y2="${ch}" stroke="#fff" stroke-opacity=".45" stroke-dasharray="6 8" stroke-width="3"/>` : "";
    return `<div class="pn pchart" style="${fl}${hs}"><div class="ct">${esc(p.title)}</div><div class="cp"><b>${esc(p.price)}</b><span style="background:${col}">${esc(p.change)}</span></div>
<svg viewBox="0 0 ${w} ${ch}" preserveAspectRatio="none"><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".4"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
<path d="${line}L${x(pts.length - 1)},${ch}L${x(0)},${ch}Z" fill="url(#pg)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="6" stroke-linejoin="round"/>${m}
<circle cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1])}" r="12" fill="${col}"/></svg>${p.mark ? `<div class="mk" style="left:${(x(p.mark.at) / w) * 100}%;transform:translateX(${x(p.mark.at) / w > 0.75 ? "calc(-100% + 8px)" : "-50%"})">${esc(p.mark.label)}</div>` : ""}<div class="cn">${esc(p.note)}</div></div>`;
  }
  if (p.kind === "tile") {
    const tone = p.tone === "up" ? "up" : p.tone === "down" ? "down" : "neutral";
    const vpx = Math.min(150, Math.round(780 / Math.max(3, [...p.value].length)) * (p.flex ?? 1));
    return `<div class="pn ptile ${tone}" style="${fl}${hs}"><div class="tl">${esc(p.label)}</div><div class="tv" style="font-size:${vpx}px">${esc(p.value)}</div>${p.change ? `<div class="tc">${tone === "down" ? "▼ " : tone === "up" ? "▲ " : ""}${esc(p.change)}</div>` : ""}</div>`;
  }
  const max = Math.max(...p.bars.map((b) => Math.abs(b.value)));
  return `<div class="pn pbars" style="${fl}${hs}"><div class="ct">${esc(p.title)}</div><div class="bs">${p.bars.map((b) =>
    `<div class="b"><span class="bt">${esc(b.text)}</span><i style="height:${Math.round((Math.abs(b.value) / max) * 100)}%;background:${b.value < 0 ? RED : GREEN}"></i><span class="bl">${esc(b.label)}</span></div>`).join("")}</div>${p.note ? `<div class="cn">${esc(p.note)}</div>` : ""}</div>`;
}

function rowsHtml(s: Card) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body { background: #FAFAF7; color: #111; display: flex; flex-direction: column; justify-content: center; padding: 70px 0 70px; }
.lead { padding: 0 34px 38px; font: 450 50px/1.24 Inter; letter-spacing: -.012em; color: #121212; }
.lead em { font-style: normal; font-weight: 750; }
.rows { margin: 0 16px; display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; gap: 14px; align-items: stretch; }
.pn { border-radius: 24px; overflow: hidden; position: relative; min-width: 0; }
.pn.img { box-shadow: 0 0 0 2px #ecebe6; background: #fff; }
.pn.img img { display: block; }
.pchart, .pbars { background: #0b0c0c; color: #fff; padding: 30px 0 0; display: flex; flex-direction: column; }
.ct { padding: 0 32px; font: 800 24px/1 Inter; letter-spacing: .05em; text-transform: uppercase; color: rgba(255,255,255,.6); }
.cp { padding: 12px 32px 0; display: flex; align-items: center; gap: 16px; }
.cp b { font: 400 92px/1 Anton; }
.cp span { font: 800 30px/1 Inter; padding: 9px 14px; border-radius: 10px; color: #fff; }
.pchart svg { display: block; width: 100%; flex: 1; min-height: 0; margin-top: 8px; }
.mk { position: absolute; top: 34px; background: #fff; color: #0b0c0c; font: 800 22px/1 Inter; padding: 8px 12px; border-radius: 9px; white-space: nowrap; }
.cn { position: absolute; left: 32px; bottom: 20px; font: 500 20px/1.2 Inter; color: rgba(255,255,255,.5); }
.ptile { color: #fff; padding: 34px 30px; display: flex; flex-direction: column; justify-content: space-between; }
.ptile.up { background: linear-gradient(160deg, #10d27a, #00a85a); }
.ptile.down { background: linear-gradient(160deg, #f0383d, #c3161b); }
.ptile.neutral { background: #0b0c0c; }
.ptile .tl { font: 800 28px/1.15 Inter; letter-spacing: .03em; text-transform: uppercase; opacity: .92; }
.ptile .tv { font-family: Anton; line-height: 1; white-space: nowrap; margin-top: 18px; }
.ptile .tc { margin-top: 14px; font: 800 28px/1.15 Inter; }
.pbars .bs { flex: 1; display: flex; gap: 16px; padding: 26px 32px 64px; align-items: stretch; }
.pbars .b { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; gap: 10px; }
.pbars .b i { display: block; width: 100%; border-radius: 0 0 12px 12px; }
.pbars .bt { font: 800 26px/1 Inter; color: #ff6a6e; }
.pbars .bl { font: 600 22px/1 Inter; color: rgba(255,255,255,.6); margin-top: auto; }
</style></head><body>
<div class="lead" data-fit="54,38,5">${marks(s.text)}</div>
<div class="rows">${(s.rows ?? []).map((r) => {
    const h = r.length > 1 || r.some((p) => p.h || p.kind !== "image") ? Math.max(...r.map((p) => p.h ?? 0)) || 520 : null;
    return `<div class="row">${r.map((p) => panelHtml(p, h)).join("")}</div>`;
  }).join("")}</div>
${FIT}</body></html>`;
}

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
  if (s.story) return storyHtml(s);
  if (s.rows?.length) return rowsHtml(s);
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

/** Seeded random, so the background is the same on every render. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Circuit-board traces: orthogonal runs with a 45° kink, a node at each end. Drawn, not an image. */
function circuit(seed: number) {
  const r = rng(seed);
  const paths: string[] = [], dots: string[] = [];
  for (let k = 0; k < 70; k++) {
    let x = Math.round(r() * 27) * 40, y = Math.round(r() * 34) * 40;
    let d = `M${x},${y}`;
    const n = 2 + Math.floor(r() * 3);
    for (let s = 0; s < n; s++) {
      const len = (2 + Math.floor(r() * 6)) * 40, dir = Math.floor(r() * 4);
      if (dir === 0) x += len; else if (dir === 1) x -= len; else if (dir === 2) y += len; else y -= len;
      d += `L${x},${y}`;
      const kink = (1 + Math.floor(r() * 2)) * 40;
      x += r() < .5 ? kink : -kink; y += r() < .5 ? kink : -kink;
      d += `L${x},${y}`;
    }
    paths.push(d);
    dots.push(`<circle cx="${x}" cy="${y}" r="7"/>`);
  }
  return `<svg class="circ" viewBox="0 0 1080 1350" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke-width="3" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join("")}</g><g class="nodes">${dots.join("")}</g></svg>`;
}

export const APP_STORE_URL = "https://apps.apple.com/app/id6805319080";

/** A QR code as crisp SVG squares (error correction M, 4-module quiet zone). */
function qrSvg(text: string) {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size, pad = 4, rects: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules.get(r, c)) rects.push(`M${c + pad},${r + pad}h1v1h-1z`);
  return `<svg viewBox="0 0 ${n + pad * 2} ${n + pad * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${rects.join("")}" fill="#050807"/></svg>`;
}

const APPLE = `<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`;

/** The fixed last slide (16 Nov 2026 v2, Mohamed's reference): dark green cinematic background (circuit traces, glow,
 *  light lines, grid floor), the headline and the line under it top left, a green-outlined "Join at Tradr.me" button and a white
 *  "Download the App" button, the App Store QR code in a green-edged card with "Scan to get the app", and the big tilted
 *  iPhone with the live tradr.me lander feed on the right. No logo row, no fine print. `line` = headline, `sub` = the
 *  line under it (*words* = bold white). */
export function endHtml(s: End) {
  const feed = src(path.join(import.meta.dirname, "assets", "lander-feed.jpg"));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
@font-face { font-family: Geist; src: url(${f("geist.woff2")}); font-weight: 400 800; }
body { background: #020504; color: #fff; font-family: Geist, Inter, sans-serif; }
.bg { position: absolute; inset: 0; background:
  radial-gradient(40% 32% at 72% 70%, rgba(0,193,106,.42), transparent 70%),
  radial-gradient(70% 45% at 66% 74%, rgba(0,120,66,.30), transparent 72%),
  radial-gradient(60% 40% at 20% 0%, rgba(0,193,106,.10), transparent 70%),
  linear-gradient(180deg, #030a07 0%, #020504 60%, #010302 100%); }
.circ { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .4; -webkit-mask-image: radial-gradient(70% 60% at 62% 60%, #000 30%, transparent 90%); }
.circ g:first-child { stroke: rgba(0,193,106,.20); }
.circ .nodes { fill: #0b2a1c; stroke: rgba(0,220,120,.55); stroke-width: 3; }
.glowlines { position: absolute; inset: 0; background:
  linear-gradient(115deg, transparent 52%, rgba(0,255,140,.10) 54.6%, rgba(160,255,210,.30) 55%, rgba(0,255,140,.10) 55.4%, transparent 58%),
  linear-gradient(65deg, transparent 63%, rgba(0,255,140,.07) 64.7%, rgba(160,255,210,.22) 65%, rgba(0,255,140,.07) 65.3%, transparent 67%);
  mix-blend-mode: screen; filter: blur(1.5px); }
.floor { position: absolute; left: -20%; right: -20%; bottom: -10px; height: 470px; transform: perspective(700px) rotateX(64deg); transform-origin: 50% 100%;
  background-image: linear-gradient(rgba(0,220,120,.30) 2px, transparent 2px), linear-gradient(90deg, rgba(0,220,120,.30) 2px, transparent 2px); background-size: 90px 90px;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 60%); }
.top { position: absolute; top: 72px; left: 72px; right: 70px; z-index: 2; }
h2 { font: 700 86px/1.02 Geist; letter-spacing: -.035em; max-width: 840px; }
h2 em { font-style: normal; color: ${GREEN}; text-shadow: 0 0 40px rgba(0,193,106,.35); }
.sub { margin-top: 30px; font: 400 36px/1.36 Geist; letter-spacing: -.01em; color: rgba(255,255,255,.72); max-width: 720px; }
.sub em { font-style: normal; font-weight: 650; color: #fff; }
.left { margin-top: 60px; width: 445px; display: flex; flex-direction: column; gap: 26px; }
.btn { height: 112px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 20px; font: 600 40px/1 Geist; letter-spacing: -.02em; white-space: nowrap; }
.btn.g { background: linear-gradient(180deg, rgba(0,193,106,.16), rgba(0,40,22,.55)); color: #fff; border: 3px solid ${GREEN};
  box-shadow: 0 0 28px rgba(0,193,106,.55), 0 0 70px rgba(0,193,106,.25), inset 0 0 26px rgba(0,193,106,.30); }
.btn.g svg { width: 40px; height: 40px; }
.btn.w { background: #fff; color: #050807; box-shadow: 0 18px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.3); }
.btn.w svg { width: 36px; height: 44px; margin-top: -6px; }
.qr { margin-top: 20px; display: flex; align-items: center; gap: 36px; }
.qr .code { width: 220px; height: 220px; padding: 16px; background: #050a07; border: 3px solid ${GREEN}; border-radius: 28px;
  box-shadow: 0 0 26px rgba(0,193,106,.5), inset 0 0 18px rgba(0,193,106,.25); }
.qr .code svg { width: 100%; height: 100%; display: block; border-radius: 10px; }
.scan { position: relative; white-space: nowrap; font: 400 36px/1.25 Geist; color: rgba(255,255,255,.72); padding-bottom: 90px; }
.scan svg { position: absolute; left: -16px; bottom: 0; width: 110px; height: 80px; }
.stage { position: absolute; left: 0; right: 0; top: 500px; height: 1000px; perspective: 2600px; }
.phone { position: absolute; left: 580px; top: 0; width: 500px; height: 1030px; border-radius: 76px; padding: 11px;
  transform: rotateX(8deg) rotateY(-14deg) rotateZ(-9deg); transform-origin: 50% 40%;
  background: linear-gradient(140deg, #8a9095 0%, #2a2e31 14%, #44494d 46%, #16191b 72%, #6a7075 100%);
  box-shadow: 30px 50px 100px rgba(0,0,0,.8), 0 0 140px rgba(0,193,106,.32), inset 0 0 0 2px rgba(255,255,255,.22); }
.phone::before { content: ""; position: absolute; left: -6px; top: 230px; width: 6px; height: 96px; border-radius: 3px 0 0 3px; background: #4a5055; box-shadow: 0 126px 0 #4a5055; }
.phone::after { content: ""; position: absolute; right: -6px; top: 300px; width: 6px; height: 150px; border-radius: 0 3px 3px 0; background: #4a5055; }
.scr { width: 100%; height: 100%; border-radius: 66px; overflow: hidden; background: #000 url('${feed}') top center / 100% auto no-repeat; position: relative; }
.scr::after { content: ""; position: absolute; inset: 0; background: linear-gradient(125deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 72%, rgba(255,255,255,.05) 100%); }
.vig { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.7)), linear-gradient(180deg, transparent 84%, rgba(2,5,4,.8) 94%, #020504 100%); }
</style></head><body>
<div class="bg"></div>${circuit(7)}<div class="glowlines"></div><div class="floor"></div>
<div class="stage"><div class="phone"><div class="scr"></div></div></div>
<div class="vig"></div>
<div class="top"><h2>${marks(s.line).replace(/\n/g, "<br>")}</h2><div class="sub">${marks(s.sub)}</div>
<div class="left"><div class="btn g"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 18 6M8 6h10v10"/></svg>Join at Tradr.me</div>
<div class="btn w">${APPLE}Download the App</div>
<div class="qr"><div class="code">${qrSvg(APP_STORE_URL)}</div><div class="scan">Scan to get<br>the app<svg viewBox="0 0 110 80" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M90 10 C 85 50, 50 68, 14 62"/><path d="M28 48 14 62 30 74"/></svg></div></div></div></div>
${FIT}</body></html>`;
}

// Tweet card renderer. Layout measured from a 1080 × 1350 reference; every position is fixed.
import type { Lang } from "../types";

export type TweetState = {
  name: string; handle: string; time: string; verified: boolean; ring: boolean;
  texts: Record<Lang, string>;
  counts: { reply: string; repost: string; like: string; views: string };
  upper: boolean; maxSize: number; minSize: number; height: number;
  avatar: string | null; grok: string | null;
  fontReg: string | null; fontRegName: string; fontBold: string | null; fontBoldName: string;
  active: Lang;
};

export const TWEET_DEFAULTS: TweetState = {
  name: "Tradr", handle: "tradr.me", time: "1h", verified: true, ring: true,
  texts: { en: "", es: "", it: "" },
  counts: { reply: "5", repost: "8", like: "103", views: "5900" },
  upper: false, maxSize: 34, minSize: 26, height: 1350,
  avatar: null, grok: null, fontReg: null, fontRegName: "", fontBold: null, fontBoldName: "", active: "en",
};

const L = {
  W: 1080, refH: 1350,
  avatarCx: 151, avatarCy: 588, avatarR: 48,
  x: 217, headerCy: 563, headerSize: 34, gapAfterName: 13, badge: 38, gapAfterBadge: 13,
  metaMaxRight: 805, grokCx: 857, grokBox: 40, dotsCx: 916, dotsGap: 14, dotR: 4.2,
  bodyTopGap: 32, lineHeight: 1.32, actionsGap: 52, iconBox: 40, countSize: 33,
  cols: [
    { key: "reply", x: 217, dx: 52 },
    { key: "repost", x: 371, dx: 60 },
    { key: "like", x: 531, dx: 52 },
    { key: "views", x: 708, dx: 46 },
  ] as const,
  bookmarkRight: 936, bottomSafe: 70, shrinkFrom: 120, shrinkTo: 480,
};
const COLOR = { bg: "#000000", text: "#e7e9ea", gray: "#71767b", ring: "#2f3336", blue: "#1d9bf0", empty: "#16181c" };
const CAP = 0.364; // baseline offset that centers capitals on a line

export type TweetAssets = { avatar: HTMLImageElement | null; grok: HTMLImageElement | null; customReg: boolean; customBold: boolean };

export function font(a: TweetAssets, role: "name" | "body" | "meta", px: number) {
  const fallback = "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif";
  if (role === "name") return a.customBold ? `${px}px TapeTweetName` : `700 ${px}px ${fallback}`;
  if (role === "body") return a.customReg ? `${px}px TapeTweetBody` : `500 ${px}px ${fallback}`;
  return a.customReg ? `${px}px TapeTweetBody` : `400 ${px}px ${fallback}`;
}

export function fmtCount(raw: string, upper: boolean) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const clean = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) return s;
  const n = parseFloat(clean);
  const K = upper ? "K" : "k";
  const one = (v: number) => (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return one(n / 1000) + K;
  if (n < 1e6) return Math.floor(n / 1000) + K;
  if (n < 1e7) return one(n / 1e6) + "M";
  return Math.floor(n / 1e6) + "M";
}

function truncate(ctx: CanvasRenderingContext2D, s: string, max: number, ell = "...") {
  if (ctx.measureText(s).width <= max) return s;
  while (s.length && ctx.measureText(s + ell).width > max) s = s.slice(0, -1);
  return s.trimEnd() + ell;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/ +/)) {
      if (!word) continue;
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
        continue;
      }
      if (line) out.push(line);
      if (ctx.measureText(word).width > maxW) {
        let chunk = "";
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxW) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = word;
    }
    out.push(line);
  }
  return out;
}

/**
 * Header + text + action row form one block. Short tweets keep the reference positions;
 * once the block's centre drops below the canvas centre, the whole block moves up so it
 * stays centred. Spacing inside the block never changes.
 */
function layoutBody(ctx: CanvasRenderingContext2D, S: TweetState, a: TweetAssets, text: string, H: number) {
  const base = (H - L.refH) / 2;
  const n = text.replace(/\s+/g, " ").trim().length;
  const t = Math.min(1, Math.max(0, (n - L.shrinkFrom) / (L.shrinkTo - L.shrinkFrom)));
  const max = Number(S.maxSize) || 34, min = Number(S.minSize) || 26;
  let size = max - t * (max - min);
  let lines: string[], lh: number, first: number, actionsCy: number, dy: number, forced = false;
  const maxW = L.bookmarkRight - L.x;
  for (;;) {
    ctx.font = font(a, "body", size);
    lines = wrap(ctx, text, maxW);
    lh = size * L.lineHeight;
    // Block at the reference position.
    const top = Math.min(L.avatarCy - L.avatarR, L.headerCy - L.headerSize / 2) + base;
    const firstRef = L.headerCy + base + L.bodyTopGap + lh / 2;
    const bottom = firstRef + (lines.length - 1) * lh + lh / 2 + L.actionsGap + L.iconBox / 2;
    const shift = Math.min(0, H / 2 - (top + bottom) / 2); // only ever moves up
    dy = base + shift;
    first = firstRef + shift;
    actionsCy = first + (lines.length - 1) * lh + lh / 2 + L.actionsGap;
    const fits = top + shift >= L.bottomSafe && bottom + shift <= H - L.bottomSafe;
    if (fits || size <= 16) break;
    size -= 0.5;
    forced = true;
  }
  return { size, lines, lh, first, actionsCy, forced, dy };
}

const ICONS = {
  reply: "M12 3c5 0 9.5 3.4 9.5 8.3S17 19.6 12 19.6c-1.2 0-2.3-.2-3.4-.5L3 21l1.5-4.3C3.2 15.2 2.5 13.3 2.5 11.3 2.5 6.4 7 3 12 3z",
  repost: "M2.5 8L6 4.5 9.5 8M6 4.5V15.5a3 3 0 0 0 3 3h4.5M21.5 16L18 19.5 14.5 16M18 19.5V8.5a3 3 0 0 0-3-3h-4.5",
  like: "M12 20.5S2.5 15 2.5 8.9C2.5 6 4.7 3.8 7.4 3.8c2 0 3.6 1.1 4.6 2.8 1-1.7 2.6-2.8 4.6-2.8 2.7 0 4.9 2.2 4.9 5.1C21.5 15 12 20.5 12 20.5z",
  views: "M3.5 20v-8M9 20V4.5M14.5 20v-6M20 20V9",
  bookmark: "M5 3.5h14V21l-7-5-7 5z",
};
let paths: Record<keyof typeof ICONS, Path2D> | null = null;

function drawIcon(ctx: CanvasRenderingContext2D, key: keyof typeof ICONS, x: number, cy: number, size: number, color: string) {
  paths ??= Object.fromEntries(Object.entries(ICONS).map(([k, d]) => [k, new Path2D(d)])) as Record<keyof typeof ICONS, Path2D>;
  const s = size / 24;
  ctx.save();
  ctx.translate(x, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(paths[key]);
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const R = size / 2;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const ang = (i / 160) * Math.PI * 2;
    const r = R * (0.92 + 0.08 * Math.cos(8 * ang));
    const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = COLOR.blue;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 0.3 * R, cy + 0.02 * R);
  ctx.lineTo(cx - 0.08 * R, cy + 0.24 * R);
  ctx.lineTo(cx + 0.32 * R, cy - 0.22 * R);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = size * 0.11;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

export function drawTweet(ctx: CanvasRenderingContext2D, S: TweetState, a: TweetAssets, rawText: string, preview: boolean) {
  const H = ctx.canvas.height;
  const body = layoutBody(ctx, S, a, (rawText || "").replace(/\s+$/, ""), H);
  const dy = body.dy;
  const hcy = L.headerCy + dy;

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, L.W, H);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Avatar
  const acx = L.avatarCx, acy = L.avatarCy + dy, ar = L.avatarR;
  ctx.save();
  ctx.beginPath();
  ctx.arc(acx, acy, ar, 0, Math.PI * 2);
  ctx.clip();
  if (a.avatar) {
    const im = a.avatar, sc = Math.max((2 * ar) / im.width, (2 * ar) / im.height);
    const w = im.width * sc, h = im.height * sc;
    ctx.drawImage(im, acx - w / 2, acy - h / 2, w, h);
  } else {
    ctx.fillStyle = COLOR.empty;
    ctx.fillRect(acx - ar, acy - ar, 2 * ar, 2 * ar);
  }
  ctx.restore();
  if (S.ring) {
    ctx.beginPath();
    ctx.arc(acx, acy, ar - 1, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.ring;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Header row
  const hb = hcy + CAP * L.headerSize;
  ctx.font = font(a, "name", L.headerSize);
  ctx.fillStyle = COLOR.text;
  const nm = truncate(ctx, S.name || "", 380);
  ctx.fillText(nm, L.x, hb);
  let x = L.x + ctx.measureText(nm).width;
  if (S.verified) {
    x += L.gapAfterName;
    drawBadge(ctx, x + L.badge / 2, hcy, L.badge);
    x += L.badge + L.gapAfterBadge;
  } else x += 12;
  ctx.font = font(a, "meta", L.headerSize);
  ctx.fillStyle = COLOR.gray;
  const handle = "@" + String(S.handle || "").replace(/^@+/, "");
  const sep = S.time ? " · " + S.time : "";
  const avail = L.metaMaxRight - x - ctx.measureText(sep).width;
  const h = truncate(ctx, handle, Math.max(40, avail));
  ctx.fillText(h, x, hb);
  ctx.fillText(sep, x + ctx.measureText(h).width, hb);

  // Top-right icon slot
  if (a.grok) {
    const im = a.grok, sc = Math.min(L.grokBox / im.width, L.grokBox / im.height);
    const w = im.width * sc, hh = im.height * sc;
    ctx.drawImage(im, L.grokCx - w / 2, hcy - hh / 2, w, hh);
  } else if (preview) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(113,118,123,.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(L.grokCx - L.grokBox / 2, hcy - L.grokBox / 2, L.grokBox, L.grokBox);
    ctx.restore();
  }
  ctx.fillStyle = COLOR.gray;
  for (const off of [-L.dotsGap, 0, L.dotsGap]) {
    ctx.beginPath();
    ctx.arc(L.dotsCx + off, hcy, L.dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  ctx.font = font(a, "body", body.size);
  ctx.fillStyle = COLOR.text;
  body.lines.forEach((line, i) => {
    if (line) ctx.fillText(line, L.x, body.first + i * body.lh + CAP * body.size);
  });

  // Actions
  ctx.font = font(a, "meta", L.countSize);
  ctx.fillStyle = COLOR.gray;
  for (const c of L.cols) {
    drawIcon(ctx, c.key, c.x, body.actionsCy, L.iconBox, COLOR.gray);
    const v = fmtCount(S.counts[c.key], S.upper);
    if (v) ctx.fillText(v, c.x + c.dx, body.actionsCy + CAP * L.countSize);
  }
  drawIcon(ctx, "bookmark", L.bookmarkRight - 19 * (L.iconBox / 24), body.actionsCy, L.iconBox, COLOR.gray);
  return body;
}

export const TWEET_WIDTH = L.W;

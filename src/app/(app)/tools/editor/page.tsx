"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AddToPost } from "@/components/add-to-post";
import { ToolFonts } from "@/components/tool-fonts";
import { useToast } from "@/components/toast";
import { useAppState } from "@/lib/client/state";
import { canvasBlob, downloadBlob, loadImage, stamp } from "@/lib/client/tools";
import { useHistory, useUndoKeys } from "@/lib/client/history";
import { UndoButtons } from "@/components/undo-buttons";
import { LANGS, LK, isLang } from "@/lib/langs";
import type { Lang } from "@/lib/types";

type Style = { size: number; weight: number; color: string; align: CanvasTextAlign };
type Block = Style & {
  id: number; x0: number; y0: number; x1: number; y1: number; baseline: number;
  bg: string; bgChanged: boolean; isNew: boolean;
  /** Where the text was dragged to, relative to its box (image px). The cover stays over the old text. */
  dx: number; dy: number;
  orig: Style & { text: string };
  /** The text per language. Starts as the original text everywhere. */
  texts: Record<Lang, string>;
};

const FONTS = ["Poppins", "Inter", "Montserrat", "DM Sans", "Roboto"];
const SIZES: [string, string][] = [["1080x1350", "1080 × 1350 (4:5)"], ["1080x1080", "1080 × 1080 (1:1)"], ["1080x1440", "1080 × 1440 (3:4)"], ["1080x1920", "1080 × 1920 (9:16)"], ["orig", "Same as the uploaded image"], ["custom", "Custom"]];

const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const median = (arr: number[]) => arr.slice().sort((x, y) => x - y)[Math.floor(arr.length / 2)] ?? 0;
const styleKeys = ["size", "weight", "color", "align"] as const;
const fit = (W: number, H: number, w: number, h: number) => {
  const s = Math.min(W / w, H / h);
  return { w: W, h: H, s, ox: (W - w * s) / 2, oy: (H - h * s) / 2 };
};
const edited = (b: Block, k: Lang) => b.isNew || b.bgChanged || !!b.dx || !!b.dy || b.texts[k] !== b.orig.text || styleKeys.some((s) => b[s] !== b.orig[s]);

export default function EditorPage() {
  return <Suspense><Editor /></Suspense>;
}

function Editor() {
  const params = useSearchParams();
  const postId = params.get("post");
  const q = params.get("lang");
  const { data } = useAppState();
  const target = data?.posts.find((p) => p.id === postId);
  const toast = useToast();

  const view = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const src = useRef<{ img: HTMLImageElement | HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } | null>(null);
  const nextId = useRef(1);
  const [ver, setVer] = useState(0); // bumps when a new image loads
  // Every change to the boxes is an undo step; a new image starts a fresh history.
  const hist = useHistory<Block[]>([]);
  const blocks = hist.state;
  const setBlocks = hist.set;
  useUndoKeys(hist.undo, hist.redo);
  const [selId, setSelId] = useState<number | null>(null);
  const [lang, setLang] = useState<Lang>(isLang(q) ? q : "en");
  const [fontFamily, setFontFamily] = useState("Poppins");
  const [customFont, setCustomFont] = useState<FontFace | null>(null);
  const [size, setSize] = useState("1080x1350");
  const [custom, setCustom] = useState({ w: 1080, h: 1350 });
  const [fill, setFill] = useState("#000000");
  const [showBoxes, setShowBoxes] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const outSize = useCallback((): [number, number] => {
    if (size === "orig" && dims) return [dims.w, dims.h];
    if (size === "custom") return [Math.max(100, custom.w || 1080), Math.max(100, custom.h || 1350)];
    return size.split("x").map(Number) as [number, number];
  }, [size, custom, dims]);
  const frame = useMemo(() => {
    const [W, H] = outSize();
    return fit(W, H, dims?.w || W, dims?.h || H);
  }, [outSize, dims]);

  const fontStr = useCallback((b: Style) => `${b.weight} ${b.size}px "${customFont ? "TapeEditorCustom" : fontFamily}", sans-serif`, [customFont, fontFamily]);

  const paint = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, k: Lang, list: Block[]) => {
    const s0 = src.current;
    if (!s0) return;
    const { s, ox, oy } = fit(W, H, s0.w, s0.h);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(s0.img, ox, oy, s0.w * s, s0.h * s);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    for (const b of list.filter((x) => edited(x, k))) {
      if (!b.isNew || b.bgChanged) {
        const pad = Math.max(2, (b.y1 - b.y0) * 0.18);
        ctx.fillStyle = b.bg;
        ctx.fillRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + pad * 2, b.y1 - b.y0 + pad * 2);
      }
      const text = b.texts[k];
      if (!text) continue;
      ctx.font = fontStr(b);
      ctx.fillStyle = b.color;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = b.align;
      const ax = (b.align === "left" ? b.x0 : b.align === "right" ? b.x1 : (b.x0 + b.x1) / 2) + b.dx;
      text.split("\n").forEach((ln, i) => ctx.fillText(ln, ax, b.baseline + b.dy + i * b.size * 1.25));
    }
    ctx.restore();
  }, [fill, fontStr]);

  const ensureFonts = useCallback(async (list: Block[], k: Lang) => {
    await Promise.all(list.filter((b) => edited(b, k)).map((b) => document.fonts.load(fontStr(b), b.texts[k] || "a"))).catch(() => {});
  }, [fontStr]);

  // Redraw the preview.
  useEffect(() => {
    let off = false;
    (async () => {
      if (!src.current || !view.current) return;
      await ensureFonts(blocks, lang);
      if (off) return;
      const [W, H] = outSize();
      view.current.width = W;
      view.current.height = H;
      paint(view.current.getContext("2d")!, W, H, lang, blocks);
    })();
    return () => {
      off = true;
    };
  }, [blocks, lang, outSize, paint, ensureFonts, ver]);

  // ---------- Pixel helpers ----------
  const sampleRing = (x0: number, y0: number, x1: number, y1: number, pad: number) => {
    const s = src.current!;
    const R: number[] = [], G: number[] = [], B: number[] = [];
    const X0 = Math.max(0, Math.floor(x0 - pad)), Y0 = Math.max(0, Math.floor(y0 - pad));
    const X1 = Math.min(s.w - 1, Math.ceil(x1 + pad)), Y1 = Math.min(s.h - 1, Math.ceil(y1 + pad));
    const w = X1 - X0 + 1, h = Y1 - Y0 + 1;
    const d = s.ctx.getImageData(X0, Y0, w, h).data;
    const push = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      R.push(d[i]);
      G.push(d[i + 1]);
      B.push(d[i + 2]);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    return [median(R), median(G), median(B)];
  };
  const textStyle = (x0: number, y0: number, x1: number, y1: number, bg: number[]) => {
    const s = src.current!;
    const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
    const d = s.ctx.getImageData(Math.round(x0), Math.round(y0), w, h).data;
    let max = 0;
    const dist: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
      dist.push(v);
      if (v > max) max = v;
    }
    const c = [0, 0, 0];
    let n = 0, ink = 0;
    for (let k = 0; k < dist.length; k++) {
      if (dist[k] > max * 0.6) { const i = k * 4; c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; n++; }
      if (dist[k] > max * 0.4) ink++;
    }
    const r = ink / dist.length;
    return { color: n ? hex(c.map((v) => v / n)) : "#ffffff", weight: r < 0.2 ? 400 : r < 0.28 ? 500 : 600 };
  };
  const makeBlock = (x0: number, y0: number, x1: number, y1: number, text: string, isNew: boolean): Block => {
    const s = src.current!;
    const h = y1 - y0;
    const bgArr = sampleRing(x0, y0, x1, y1, Math.max(3, h * 0.25));
    const st = isNew ? { color: lum(bgArr[0], bgArr[1], bgArr[2]) < 128 ? "#ffffff" : "#111111", weight: 400 } : textStyle(x0, y0, x1, y1, bgArr);
    const desc = /[gjpqyQ,;]/.test(text), asc = /[A-Z0-9bdfhiklt'"!?$€£%]/.test(text);
    let sz = isNew ? h * 0.8 : desc ? (asc ? h / 0.95 : h / 0.76) : asc ? h / 0.74 : h / 0.55;
    sz = Math.round(sz * 2) / 2;
    const baseline = isNew ? y0 + h * 0.8 : desc ? y1 - 0.21 * sz : y1;
    const align: CanvasTextAlign = Math.abs((x0 + x1) / 2 - s.w / 2) < s.w * 0.03 ? "center" : "left";
    const style: Style = { size: sz, weight: st.weight, color: st.color, align };
    return { id: nextId.current++, x0, y0, x1, y1, baseline, bg: hex(bgArr), bgChanged: false, isNew, dx: 0, dy: 0, orig: { ...style, text }, ...style, texts: { en: text, es: text, it: text } };
  };

  // ---------- Text detection ----------
  /** Finds the text in the image. On a new image it's the starting point; "Find text again" is an undoable step. */
  const findText = async (fresh: boolean) => {
    const s = src.current;
    if (!s) return;
    setStatus("Loading text reader…");
    const up = s.w < 1000 ? 2 : 1;
    const pre = document.createElement("canvas");
    pre.width = s.w * up;
    pre.height = s.h * up;
    const p = pre.getContext("2d", { willReadFrequently: true })!;
    p.imageSmoothingQuality = "high";
    p.drawImage(s.img, 0, 0, pre.width, pre.height);
    const id = p.getImageData(0, 0, pre.width, pre.height), d = id.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += lum(d[i], d[i + 1], d[i + 2]);
    const invert = sum / (d.length / 4) < 128;
    for (let i = 0; i < d.length; i += 4) {
      let v = lum(d[i], d[i + 1], d[i + 2]);
      if (invert) v = 255 - v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    p.putImageData(id, 0, 0);
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(["eng", "ita", "spa"], 1, {
        logger: (m) => { if (m.status === "recognizing text") setStatus(`Finding text… ${Math.round(m.progress * 100)}%`); },
      });
      const { data } = await worker.recognize(pre, {}, { blocks: true });
      const lines = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((pp) => pp.lines));
      const out: Block[] = [];
      for (const line of lines) {
        const words = line.words.filter((w) => w.confidence >= 40 && /[\p{L}\p{N}$€£%]/u.test(w.text));
        if (!words.length) continue;
        const lh = median(words.map((w) => w.bbox.y1 - w.bbox.y0));
        let group = [words[0]];
        const groups = [group];
        for (let i = 1; i < words.length; i++) {
          if (words[i].bbox.x0 - words[i - 1].bbox.x1 > lh * 1.6) { group = [words[i]]; groups.push(group); }
          else group.push(words[i]);
        }
        for (const g of groups) {
          const conf = g.reduce((a, w) => a + w.confidence, 0) / g.length;
          if (conf < 55) continue;
          const x0 = Math.min(...g.map((w) => w.bbox.x0)) / up, y0 = Math.min(...g.map((w) => w.bbox.y0)) / up;
          const x1 = Math.max(...g.map((w) => w.bbox.x1)) / up, y1 = Math.max(...g.map((w) => w.bbox.y1)) / up;
          if (y1 - y0 < 6) continue;
          out.push(makeBlock(x0, y0, x1, y1, g.map((w) => w.text).join(" ").trim(), false));
        }
      }
      if (fresh) hist.reset(out);
      else setBlocks(() => out);
      setStatus(out.length ? `Found ${out.length} text${out.length === 1 ? "" : "s"}. Tap one to edit it.` : "No text found. Use “Draw a box” to mark it yourself.");
    } catch (e) {
      console.error(e);
      setStatus("Couldn't read the text in this image. Use “Draw a box” to mark it yourself.");
    } finally {
      worker?.terminate();
    }
  };

  const loadSource = async (img: HTMLImageElement) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    src.current = { img: c, ctx, w: c.width, h: c.height };
    const px = [[2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
    setFill(hex([0, 1, 2].map((i) => px.reduce((a, d) => a + d[i], 0) / 4)));
    hist.reset([]);
    setSelId(null);
    setDims({ w: c.width, h: c.height });
    setVer((v) => v + 1);
    await findText(true);
  };

  const loadFile = async (file: File | Blob | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    try {
      await loadSource(await loadImage(url));
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const loadRef = useRef(loadFile);
  useEffect(() => {
    loadRef.current = loadFile;
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        loadRef.current(item.getAsFile());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ---------- Editing ----------
  const cur = blocks.find((b) => b.id === selId) || null;
  /** Changes the selected box. Changes with the same `key` in quick succession (typing, dragging a colour) are one undo step. */
  const edit = (fn: (b: Block) => Partial<Block>, key?: string) =>
    setBlocks((bs) => bs.map((b) => (b.id === selId ? { ...b, ...fn(b) } : b)), { key: key && `${selId}:${key}` });

  // ---------- Move a box (drag it) ----------
  const move = useRef<{ id: number; x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const onBoxDown = (e: React.PointerEvent, b: Block) => {
    if (addMode) return;
    e.stopPropagation();
    setSelId(b.id);
    move.current = { id: b.id, x: e.clientX, y: e.clientY, dx: b.dx, dy: b.dy, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBoxMove = (e: React.PointerEvent) => {
    const m = move.current;
    if (!m) return;
    if (!m.moved && Math.hypot(e.clientX - m.x, e.clientY - m.y) < 3) return;
    const r = overlay.current!.getBoundingClientRect();
    const k = frame.w / r.width / frame.s; // screen px → image px
    const dx = Math.round(m.dx + (e.clientX - m.x) * k), dy = Math.round(m.dy + (e.clientY - m.y) * k);
    // The whole drag is one undo step.
    setBlocks((bs) => bs.map((x) => (x.id === m.id ? { ...x, dx, dy } : x)), { quiet: m.moved });
    m.moved = true;
  };
  const onBoxUp = () => {
    move.current = null;
  };

  // ---------- Draw a box ----------
  const drag = useRef<{ ix: number; iy: number; cx: number; cy: number; el: HTMLDivElement } | null>(null);
  const toImg = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    const f = frame;
    const px = ((e.clientX - r.left) / r.width) * f.w, py = ((e.clientY - r.top) / r.height) * f.h;
    return [(px - f.ox) / f.s, (py - f.oy) / f.s, e.clientX - r.left, e.clientY - r.top];
  };
  const onDown = (e: React.PointerEvent) => {
    if (!addMode) {
      if (e.target === overlay.current) setSelId(null);
      return;
    }
    const [ix, iy, cx, cy] = toImg(e);
    const el = document.createElement("div");
    el.className = "absolute border-2 border-[var(--focus)] bg-[color-mix(in_srgb,var(--focus)_10%,transparent)] pointer-events-none";
    overlay.current!.appendChild(el);
    drag.current = { ix, iy, cx, cy, el };
    overlay.current!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [, , cx, cy] = toImg(e);
    Object.assign(d.el.style, { left: Math.min(cx, d.cx) + "px", top: Math.min(cy, d.cy) + "px", width: Math.abs(cx - d.cx) + "px", height: Math.abs(cy - d.cy) + "px" });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = src.current!;
    const [ix, iy] = toImg(e);
    d.el.remove();
    drag.current = null;
    setAddMode(false);
    const x0 = Math.max(0, Math.min(ix, d.ix)), x1 = Math.min(s.w, Math.max(ix, d.ix));
    const y0 = Math.max(0, Math.min(iy, d.iy)), y1 = Math.min(s.h, Math.max(iy, d.iy));
    if (x1 - x0 < 8 || y1 - y0 < 8) return;
    const ring = sampleRing(x0, y0, x1, y1, 0);
    const inner = s.ctx.getImageData(Math.round(x0) + 1, Math.round(y0) + 1, Math.max(1, Math.round(x1 - x0) - 2), Math.max(1, Math.round(y1 - y0) - 2)).data;
    let busy = 0;
    for (let i = 0; i < inner.length; i += 4) if (Math.hypot(inner[i] - ring[0], inner[i + 1] - ring[1], inner[i + 2] - ring[2]) > 60) busy++;
    const hasText = busy / (inner.length / 4) > 0.03;
    const b = makeBlock(x0, y0, x1, y1, hasText ? "" : "Text", !hasText);
    if (hasText) {
      b.isNew = false;
      b.orig.text = "(marked by hand)";
      b.texts = { en: "", es: "", it: "" };
    }
    setBlocks((bs) => [...bs, b]);
    setSelId(b.id);
  };

  const render = useCallback(async (k: Lang) => {
    await ensureFonts(blocks, k);
    const [W, H] = outSize();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    paint(c.getContext("2d")!, W, H, k, blocks);
    return canvasBlob(c, "image/png");
  }, [blocks, outSize, paint, ensureFonts]);

  const changedLangs = useMemo(() => LK.filter((k) => blocks.some((b) => edited(b, k))), [blocks]);
  const hasImg = ver > 0;
  const f = frame;
  const postSlides = target ? LK.flatMap((k) => target.variants[k].slides.map((s) => ({ ...s, k }))) : [];

  return (
    <div className="lg:grid lg:grid-cols-[340px_1fr] min-h-dvh">
      <ToolFonts />
      <aside className="order-2 lg:order-1 border-r p-4 md:p-6 flex flex-col gap-6 lg:max-h-dvh lg:overflow-auto" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
        <h1 className="font-bold text-[17px] hidden lg:block">Image text editor</h1>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Image</legend>
          <div className="flex flex-wrap gap-1.5">
            <label className="btn cursor-pointer">Upload image<input type="file" accept="image/*" className="hidden" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button className="btn" disabled={!hasImg} onClick={() => { setSelId(null); findText(false); }}>Find text again</button>
          </div>
          <div className="text-[12px] muted">You can also paste with ⌘V or drop a file onto the page.</div>
          {postSlides.length > 0 && (
            <div>
              <span className="label mt-1">Or start from a slide of “{target!.title || "Untitled"}”</span>
              <div className="flex gap-1.5 scroll-x">
                {postSlides.map((s) => (
                  <button key={s.id + s.k} className="flex-none relative" onClick={async () => { try { await loadSource(await loadImage(s.url)); } catch (e) { toast((e as Error).message, { tone: "error" }); } }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt="" crossOrigin="anonymous" className="w-12 aspect-[4/5] object-cover rounded" />
                    <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold bg-black/70 text-white rounded px-1">{s.k.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Language</legend>
          <div className="seg self-start" role="group" aria-label="Language">
            {LANGS.map((l) => <button key={l.k} aria-pressed={lang === l.k} onClick={() => setLang(l.k)}>{l.code}{changedLangs.includes(l.k) ? " •" : ""}</button>)}
          </div>
          <div className="text-[12px] muted">Each language keeps its own text in every box. Size, color and position are shared.</div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Selected text</legend>
          {cur ? (
            <>
              <label className="label" htmlFor="t_text">Text ({lang.toUpperCase()})</label>
              <textarea id="t_text" className="field" rows={3} value={cur.texts[lang]} onChange={(e) => edit((b) => ({ texts: { ...b.texts, [lang]: e.target.value } }), `text:${lang}`)} />
              <div className="text-[12px] muted">{cur.isNew ? "New text" : `Original: “${cur.orig.text}”`}</div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div><label className="label" htmlFor="t_size">Size (px)</label><input id="t_size" type="number" className="field" step={0.5} min={4} value={cur.size} onChange={(e) => edit((b) => ({ size: Math.max(4, +e.target.value || b.size) }), "size")} /></div>
                <div><label className="label" htmlFor="t_weight">Weight</label>
                  <select id="t_weight" className="field" value={cur.weight} onChange={(e) => edit(() => ({ weight: +e.target.value }))}>
                    {[[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="t_color">Color</label><input id="t_color" type="color" className="w-11 h-9 rounded-md border p-0.5" style={{ borderColor: "var(--line)" }} value={cur.color} onChange={(e) => edit(() => ({ color: e.target.value }), "color")} /></div>
              </div>
              <span className="label">Alignment (where the text grows from)</span>
              <div className="seg self-start">
                {(["left", "center", "right"] as CanvasTextAlign[]).map((a) => <button key={a} aria-pressed={cur.align === a} onClick={() => edit(() => ({ align: a }))}>{a[0].toUpperCase() + a.slice(1)}</button>)}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Cover color" className="w-11 h-9 rounded-md border p-0.5" style={{ borderColor: "var(--line)" }} value={cur.bg} onChange={(e) => edit(() => ({ bg: e.target.value, bgChanged: true }), "bg")} />
                <span className="text-[12px] muted">Cover color, painted over the old text. Picked from around it.</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className="btn small" onClick={() => edit((b) => ({ ...b.orig, texts: { ...b.texts, [lang]: b.orig.text }, bgChanged: false, dx: 0, dy: 0 }))}>Reset this box</button>
                <button className="btn small" onClick={() => edit((b) => ({ texts: { ...b.texts, [lang]: "" } }))}>Erase text</button>
                {cur.isNew && <button className="btn small danger" onClick={() => { setBlocks((bs) => bs.filter((b) => b.id !== selId)); setSelId(null); }}>Remove box</button>}
              </div>
            </>
          ) : <div className="text-[13px] muted">Tap any text on the image to edit it. Drag a selected box to move its text.</div>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Missed text</legend>
          <button className={`btn self-start ${addMode ? "primary" : ""}`} aria-pressed={addMode} disabled={!hasImg} onClick={() => setAddMode((x) => !x)}>Draw a box</button>
          <div className="text-[12px] muted">If some text wasn’t found, draw a box around it. Draw in an empty spot to add new text.</div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Font</legend>
          <select className="field" value={customFont ? "__custom" : fontFamily} onChange={(e) => { if (e.target.value !== "__custom") { setFontFamily(e.target.value); setCustomFont(null); } }}>
            {FONTS.map((x) => <option key={x}>{x}</option>)}
            {customFont && <option value="__custom">Uploaded font</option>}
          </select>
          <label className="btn small self-start cursor-pointer">Upload font file<input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const ff = new FontFace("TapeEditorCustom", await file.arrayBuffer());
              await ff.load();
              if (customFont) document.fonts.delete(customFont);
              document.fonts.add(ff);
              setCustomFont(ff);
              setStatus(`Using ${file.name}`);
            } catch {
              toast("That font file couldn't be read. Try a .ttf or .otf.", { tone: "error" });
            }
          }} /></label>
          <div className="text-[12px] muted">Used for every text you change. Match it to the original image.</div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Export size</legend>
          <select className="field" value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {size === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" className="field" aria-label="Width" value={custom.w} onChange={(e) => setCustom((c) => ({ ...c, w: +e.target.value }))} />
              <input type="number" className="field" aria-label="Height" value={custom.h} onChange={(e) => setCustom((c) => ({ ...c, h: +e.target.value }))} />
            </div>
          )}
          <div className="text-[12px] muted">If the shape differs from the image, it’s fitted inside and the edges are filled with the background color. Instagram accepts 4:5 to 1.91:1.</div>
        </fieldset>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="chk" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Show boxes on the image</label>
      </aside>

      <main className="order-1 lg:order-2 lg:sticky lg:top-0 lg:h-dvh flex flex-col items-center justify-center gap-3 p-4 md:p-7"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}>
        {!hasImg && (
          <label className="rounded-xl border-2 border-dashed px-8 py-14 text-center muted max-w-[520px] cursor-pointer" style={{ borderColor: "var(--line-2)" }}>
            <strong className="block text-[16px] mb-1.5" style={{ color: "var(--ink)" }}>Paste, drop or upload an image</strong>
            The text in it will be found automatically.
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
        <div className="relative" style={{ display: hasImg ? "block" : "none" }}>
          <canvas ref={view} className="block w-full max-w-[460px] lg:max-w-none lg:w-auto lg:max-h-[calc(100dvh-150px)] h-auto shadow-[0_0_0_1px_rgba(0,0,0,.18)]" />
          <div ref={overlay} className={`absolute inset-0 touch-none ${addMode ? "cursor-crosshair" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
            {blocks.map((b) => (
              <button key={b.id} aria-label={`Edit text: ${b.orig.text || "new text"}`} title={b.id === selId ? "Drag to move" : undefined}
                onClick={(e) => { if (addMode) return; e.stopPropagation(); setSelId(b.id); }}
                onPointerDown={(e) => onBoxDown(e, b)} onPointerMove={onBoxMove} onPointerUp={onBoxUp} onPointerCancel={onBoxUp}
                className={`absolute rounded-[2px] p-0 ${!addMode && b.id === selId ? "cursor-move" : ""}`}
                style={{
                  left: `${((f.ox + (b.x0 + b.dx) * f.s) / f.w) * 100}%`, top: `${((f.oy + (b.y0 + b.dy) * f.s) / f.h) * 100}%`,
                  width: `${((b.x1 - b.x0) * f.s / f.w) * 100}%`, height: `${((b.y1 - b.y0) * f.s / f.h) * 100}%`,
                  border: b.id === selId ? "2px solid var(--focus)" : showBoxes ? `1px dashed ${edited(b, lang) ? "rgba(46,204,113,.85)" : "rgba(29,155,240,.6)"}` : "1px solid transparent",
                  background: b.id === selId ? "rgba(29,155,240,.1)" : "transparent",
                }} />
            ))}
          </div>
        </div>
        <div className="text-[12px] muted text-center min-h-[18px]" role="status">{status}</div>
        {hasImg && (
          <div className="flex flex-wrap gap-2 justify-center">
            <UndoButtons undo={hist.undo} redo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} />
            <button className="btn primary" onClick={() => setSending(true)}>{target ? `Add to “${target.title || "Untitled"}”` : "Add to a post"}</button>
            <button className="btn" onClick={async () => downloadBlob(await render(lang), `edited-${stamp()}-${lang}.png`)}>Download {lang.toUpperCase()}</button>
          </div>
        )}
      </main>
      <AddToPost open={sending} onClose={() => setSending(false)} render={render} available={LK} defaultLangs={changedLangs.length ? changedLangs : [lang]} targetPostId={postId} />
    </div>
  );
}

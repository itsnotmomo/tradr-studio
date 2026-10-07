"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { useAppState } from "@/lib/client/state";
import { LK, langInfo } from "@/lib/langs";
import type { Lang, Post, Settings, Slide } from "@/lib/types";

// One viewer for every carousel preview: a hover popover (mouse only, after 0.5 s) and a
// full-screen lightbox (click / tap). It shows the exact stored slide files in posting order,
// Tradr slide last, so the preview is what gets posted.

type Deck = { slides: Slide[]; tradrId: string | null; title: string };
type Ctx = {
  hover: (el: HTMLElement, deck: Deck) => void;
  unhover: () => void;
  open: (deck: Deck, start?: number) => void;
};
const ViewerCtx = createContext<Ctx>({ hover: () => {}, unhover: () => {}, open: () => {} });
export const useViewer = () => useContext(ViewerCtx);

/** A language's full carousel, Tradr slide last. */
export function deckFor(post: Post, k: Lang, s: Settings | undefined): Deck {
  const end = s?.langs[k].tradrSlide ?? null;
  return { slides: [...post.variants[k].slides, ...(end ? [end] : [])], tradrId: end?.id ?? null, title: `${post.title || "Untitled"} · ${langInfo(k).code}` };
}

/** Planner language: the filtered one, or EN in "All" (another language only if EN has no slides yet). */
export function previewLang(post: Post, lang: Lang | "all"): Lang {
  if (lang !== "all") return lang;
  if (post.variants.en.slides.length) return "en";
  return LK.find((k) => post.variants[k].slides.length) ?? "en";
}

const canHover = () => typeof window !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Props for a thumbnail: hover preview, and click opens the lightbox instead of following the card's link. */
export function usePreview(post: Post, lang: Lang | "all", start = 0) {
  const v = useViewer();
  const { data } = useAppState();
  const deck = () => deckFor(post, previewLang(post, lang), data?.settings);
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => canHover() && deck().slides.length && v.hover(e.currentTarget, deck()),
    onMouseLeave: () => v.unhover(),
    onPointerDown: () => v.unhover(),
    onClick: (e: React.MouseEvent) => {
      const d = deck();
      if (!d.slides.length) return;
      e.preventDefault();
      e.stopPropagation();
      v.unhover();
      v.open(d, start);
    },
  };
}

export function SlideViewerProvider({ children }: { children: ReactNode }) {
  const [pop, setPop] = useState<{ deck: Deck; rect: DOMRect; i: number } | null>(null);
  const [box, setBox] = useState<{ deck: Deck; i: number } | null>(null);
  const showT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideT = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hover = useCallback<Ctx["hover"]>((el, deck) => {
    clearTimeout(hideT.current);
    clearTimeout(showT.current);
    showT.current = setTimeout(() => setPop({ deck, rect: el.getBoundingClientRect(), i: 0 }), 500);
  }, []);
  const unhover = useCallback(() => {
    clearTimeout(showT.current);
    clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setPop(null), 150);
  }, []);
  const keepPop = () => clearTimeout(hideT.current);
  const open = useCallback<Ctx["open"]>((deck, start = 0) => {
    clearTimeout(showT.current);
    setPop(null);
    setBox({ deck, i: Math.max(0, Math.min(start, deck.slides.length - 1)) });
  }, []);

  const step = useCallback((d: number) => {
    setBox((b) => (b ? { ...b, i: (b.i + d + b.deck.slides.length) % b.deck.slides.length } : b));
    setPop((p) => (p ? { ...p, i: (p.i + d + p.deck.slides.length) % p.deck.slides.length } : p));
  }, []);

  // Keys work for whichever is open.
  useEffect(() => {
    if (!pop && !box) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") {
        setBox(null);
        setPop(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop, box, step]);

  // No page scrolling behind the lightbox.
  useEffect(() => {
    if (!box) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [box]);

  return (
    <ViewerCtx.Provider value={{ hover, unhover, open }}>
      {children}
      {pop && <Popover pop={pop} onEnter={keepPop} onLeave={unhover} step={step} />}
      {box && <Lightbox box={box} step={step} close={() => setBox(null)} />}
    </ViewerCtx.Provider>
  );
}

const counter = (deck: Deck, i: number) => `${i + 1} / ${deck.slides.length}${deck.slides[i]?.id === deck.tradrId ? " · Tradr slide" : ""}`;

function Popover({ pop, onEnter, onLeave, step }: { pop: { deck: Deck; rect: DOMRect; i: number }; onEnter: () => void; onLeave: () => void; step: (d: number) => void }) {
  const s = pop.deck.slides[pop.i];
  const H = Math.min(620, window.innerHeight - 48);
  const W = Math.round((H - 44) * (s.w / s.h)) + 16;
  const r = pop.rect;
  const right = r.right + 12 + W < window.innerWidth;
  const left = right ? r.right + 12 : Math.max(8, r.left - 12 - W);
  const top = Math.max(16, Math.min(r.top + r.height / 2 - H / 2, window.innerHeight - H - 16));
  return (
    <div className="fixed z-[90] rounded-xl shadow-2xl flex flex-col p-2 gap-1.5" style={{ left, top, width: W, height: H, background: "#111" }}
      onMouseEnter={onEnter} onMouseLeave={onLeave} role="dialog" aria-label="Slide preview">
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.url} alt={counter(pop.deck, pop.i)} className="max-w-full max-h-full object-contain rounded" />
        {pop.deck.slides.length > 1 && <>
          <button className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center" onClick={() => step(-1)} aria-label="Previous slide"><Icon name="left" size={16} /></button>
          <button className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center" onClick={() => step(1)} aria-label="Next slide"><Icon name="right" size={16} /></button>
        </>}
      </div>
      <div className="flex justify-between text-[11.5px] text-[#aaa] px-1"><span className="truncate">{pop.deck.title}</span><span className="tabular-nums flex-none pl-2">{counter(pop.deck, pop.i)}</span></div>
    </div>
  );
}

function Lightbox({ box, step, close }: { box: { deck: Deck; i: number }; step: (d: number) => void; close: () => void }) {
  const s = box.deck.slides[box.i];
  const startX = useRef<number | null>(null);
  // Warm the neighbours so stepping is instant.
  useEffect(() => {
    for (const d of [1, -1]) {
      const n = box.deck.slides[(box.i + d + box.deck.slides.length) % box.deck.slides.length];
      if (n) new Image().src = n.url;
    }
  }, [box]);
  return (
    <div className="fixed inset-0 z-[95] flex flex-col" style={{ background: "rgba(0,0,0,.92)" }} role="dialog" aria-modal="true" aria-label="Slides"
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        const dx = startX.current === null ? 0 : e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        else if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop) close();
      }}>
      <div className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 text-white">
        <span className="flex-1 truncate text-[14px] font-semibold">{box.deck.title}</span>
        <span className="text-[13px] tabular-nums text-[#bbb]">{counter(box.deck, box.i)}</span>
        <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" onClick={close} aria-label="Close"><Icon name="x" size={20} /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-[max(16px,env(safe-area-inset-bottom))]" data-backdrop="1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.url} alt={counter(box.deck, box.i)} className="max-w-full max-h-full object-contain select-none" draggable={false} />
        {box.deck.slides.length > 1 && <>
          <button className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white items-center justify-center" onClick={() => step(-1)} aria-label="Previous slide"><Icon name="left" size={22} /></button>
          <button className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white items-center justify-center" onClick={() => step(1)} aria-label="Next slide"><Icon name="right" size={22} /></button>
        </>}
      </div>
      <div className="flex justify-center gap-1.5 pb-[max(14px,env(safe-area-inset-bottom))]">
        {box.deck.slides.map((x, j) => <i key={x.id + j} className="w-1.5 h-1.5 rounded-full" style={{ background: j === box.i ? "#fff" : "rgba(255,255,255,.3)" }} />)}
      </div>
    </div>
  );
}

/** A slide thumbnail that previews (hover) and opens (click) its carousel at this slide. */
export function PreviewImg({ post, lang, index, src, alt, className, style, hover = true }: {
  post: Post; lang: Lang; index: number; src: string; alt: string; className?: string; style?: React.CSSProperties; hover?: boolean;
}) {
  const { onMouseEnter, onMouseLeave, ...rest } = usePreview(post, lang, index);
  const p = hover ? { onMouseEnter, onMouseLeave, ...rest } : rest;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`${className || ""} cursor-zoom-in`} style={style} {...p} />;
}

/** The square thumbnail used in lists (Ideas, Batch): first slide, preview on hover, lightbox on click. */
export function PreviewThumb({ post, lang, className }: { post: Post; lang: Lang | "all"; className?: string }) {
  const k = previewLang(post, lang);
  const first = post.variants[k].slides[0];
  const p = usePreview(post, lang);
  return <div {...(first ? p : {})} className={`thumb aspect-[4/5] rounded-md flex-none ${first ? "cursor-zoom-in" : ""} ${className || ""}`} style={first ? { backgroundImage: `url("${first.url}")` } : undefined} />;
}

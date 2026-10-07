"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { LangDots } from "./ui";
import { LK } from "@/lib/langs";
import { slotName } from "@/lib/slots";
import type { Lang, Post } from "@/lib/types";

export function firstSlide(p: Post, prefer?: Lang) {
  const order = prefer ? [prefer, ...LK.filter((k) => k !== prefer)] : LK;
  for (const k of order) if (p.variants[k].slides[0]) return p.variants[k].slides[0];
  return null;
}

export const canMove = (p: Post) => !LK.some((k) => ["posted", "publishing"].includes(p.variants[k].state));

type Variant = "card" | "chip" | "row";
type DragProps = { ref?: (el: HTMLElement | null) => void; dragging?: boolean; movable?: boolean } & Record<string, unknown>;

/** Planner card. Drag to move (long-press on touch), tap to open. */
export function PostCard({ post, lang, variant = "card" }: { post: Post; lang: Lang | "all"; variant?: Variant }) {
  const movable = canMove(post);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id, disabled: !movable });
  return <PostCardView post={post} lang={lang} variant={variant} drag={{ ref: setNodeRef, dragging: isDragging, movable, ...listeners, ...attributes }} />;
}

/** The card itself, without drag wiring (also used as the floating drag preview). */
export function PostCardView({ post, lang, variant = "card", drag }: { post: Post; lang: Lang | "all"; variant?: Variant; drag?: DragProps }) {
  const langs = lang === "all" ? LK : [lang];
  const slide = firstSlide(post, lang === "all" ? "en" : lang);
  const { ref, dragging, movable, ...handlers } = drag || {};
  // No iOS link preview on long press: that gesture starts a drag here.
  const style = { opacity: dragging ? 0.35 : 1, WebkitTouchCallout: "none" as const, WebkitUserSelect: "none" as const, userSelect: "none" as const, touchAction: movable ? ("manipulation" as const) : undefined };
  const common = { ref, ...handlers, href: `/posts/${post.id}${lang !== "all" ? `?lang=${lang}` : ""}` };

  if (variant === "chip") {
    return (
      <Link {...common} className="flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11.5px] min-w-0 hover:border-[var(--line-2)]" style={{ ...style, background: "var(--panel)", borderColor: "var(--line)" }}>
        <span className="muted flex-none font-semibold">{post.slot === "morning" ? "AM" : "PM"}</span>
        <span className="flex-1 truncate font-medium">{post.title || "Untitled"}</span>
        <LangDots post={post} langs={langs} labels={false} />
      </Link>
    );
  }
  if (variant === "row") {
    return (
      <Link {...common} className="flex items-center gap-3 rounded-xl border p-2 pr-3 min-w-0 hover:border-[var(--line-2)]" style={{ ...style, background: "var(--panel)", borderColor: "var(--line)" }}>
        <div className="thumb w-11 aspect-[4/5] rounded-md flex-none" style={slide ? { backgroundImage: `url("${slide.url}")` } : undefined} />
        <div className="flex-1 min-w-0">
          <div className="truncate font-semibold text-[13.5px]">{post.title || "Untitled"}</div>
          <div className="flex items-center gap-2 mt-0.5 text-[12px] muted">
            {post.date && <span>{slotName(post.slot)}</span>}
            <LangDots post={post} langs={langs} />
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link {...common} className="block rounded-lg border overflow-hidden hover:border-[var(--line-2)]" style={{ ...style, background: "var(--soft)", borderColor: "var(--line)" }}>
      <div className="thumb aspect-[4/5] flex items-center justify-center text-[11px] text-[#888]" style={slide ? { backgroundImage: `url("${slide.url}")` } : undefined}>
        {!slide && "No slides yet"}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate font-semibold text-[12.5px]">{post.title || "Untitled"}</div>
        <div className="flex items-center justify-between gap-1 mt-0.5 text-[11.5px] muted">
          <LangDots post={post} langs={langs} labels={lang === "all"} />
        </div>
      </div>
    </Link>
  );
}

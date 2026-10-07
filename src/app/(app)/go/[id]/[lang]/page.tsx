"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { copyText, slotTimeLabel } from "@/components/publish";
import { StatusSetter } from "@/components/status";
import { PreviewImg } from "@/components/slide-viewer";
import { useNamed } from "@/components/name-prompt";
import { useToast } from "@/components/toast";
import { Spinner, StatusPill } from "@/components/ui";
import { patchPost, useAppState } from "@/lib/client/state";
import { downloadUrl } from "@/lib/client/upload";
import { defaultRange, nextAfter, rangeQuery, type Range } from "@/lib/client/sequence";
import { buildCaption } from "@/lib/caption";
import { LANGS, isLang } from "@/lib/langs";
import { slotName } from "@/lib/slots";
import { statusOf } from "@/lib/status";
import { fmtDate } from "@/lib/time";
import type { Lang, PostStatus } from "@/lib/types";

export default function GoPage({ params }: { params: Promise<{ id: string; lang: string }> }) {
  const { id, lang } = use(params);
  return <Suspense><Go key={`${id}:${lang}`} id={id} k={isLang(lang) ? lang : "it"} /></Suspense>;
}

/** One post, one account: save slides, copy caption, mark it. Built for one hand. */
function Go({ id, k }: { id: string; k: Lang }) {
  const { data } = useAppState();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const named = useNamed();
  const range: Range = params.get("from") && params.get("to") ? { from: params.get("from")!, to: params.get("to")! } : defaultRange(14);
  const post = data?.posts.find((p) => p.id === id);
  const [files, setFiles] = useState<File[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<PostStatus | null>(null);

  const slides = useMemo(() => {
    if (!post || !data) return [];
    const end = data.settings.langs[k].tradrSlide;
    return [...post.variants[k].slides, ...(end ? [end] : [])];
  }, [post, data, k]);

  // Fetch the images up front: iOS only opens the share sheet straight from the tap.
  useEffect(() => {
    let off = false;
    if (!slides.length) return;
    (async () => {
      const out: File[] = [];
      for (const [i, s] of slides.entries()) {
        const blob = await (await fetch(s.url)).blob();
        out.push(new File([blob], `${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
      }
      if (!off) setFiles(out);
    })().catch(() => !off && setFiles([]));
    return () => {
      off = true;
    };
  }, [slides]);

  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;
  if (!post) return <div className="p-6">This post doesn’t exist anymore. <Link className="underline" href="/batch">Back to Batch</Link></div>;

  const l = LANGS.find((x) => x.k === k)!;
  const v = post.variants[k];
  const caption = buildCaption(v);
  const missingEnd = !data.settings.langs[k].tradrSlide;
  const next = nextAfter(data.posts, range, post.id, k);
  const goNext = () => router.push(next ? `/go/${next.post.id}/${next.k}?${rangeQuery(range)}` : `/batch?${rangeQuery(range)}&done=1`);

  const save = async () => {
    if (!files?.length) return;
    try {
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    // No share sheet (desktop): download them one by one.
    for (const [i, s] of slides.entries()) {
      await downloadUrl(s.url, `${post.date || "idea"}_${k.toUpperCase()}_${String(i + 1).padStart(2, "0")}.jpg`);
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const copy = async () => {
    const ok = await copyText(caption);
    setCopied(ok);
    if (!ok) toast("Copy failed.", { tone: "error" });
  };
  const mark = async (status: PostStatus) => {
    setBusy(status);
    try {
      const r = await named((title) => patchPost(post.id, { ...(title ? { title } : {}), variants: { [k]: { status } } }));
      if (r) goNext();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const big = "w-full rounded-2xl py-4 px-5 text-[17px] font-bold flex items-center justify-center gap-2.5 active:scale-[.99] transition disabled:opacity-40";
  return (
    <div className="max-w-[520px] mx-auto px-4 pt-3 pb-8 flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link href={`/batch?${rangeQuery(range)}`} className="btn small ghost" aria-label="Back to Batch"><Icon name="back" size={18} /></Link>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[17px] truncate">{post.title || "Untitled"}</div>
          <div className="text-[13px] muted truncate">
            <b style={{ color: "var(--ink)" }}>{l.code}</b> · {l.handle}
            {post.date && <> · {fmtDate(post.date, { weekday: "short", day: "numeric", month: "short" })} · {slotName(post.slot)} {slotTimeLabel(data.settings, k, post)}</>}
          </div>
        </div>
        <StatusPill s={statusOf(post, k, data.settings)} />
      </header>

      <div className="flex gap-1.5 scroll-x -mx-4 px-4">
        {slides.map((s, i) => (
          <PreviewImg key={s.id + i} post={post} lang={k} index={i} hover={false} src={s.url} alt={`Slide ${i + 1}`} className="h-[150px] aspect-[4/5] object-cover rounded-lg flex-none" style={i === slides.length - 1 && !missingEnd ? { outline: "2px solid var(--s-posted)", outlineOffset: -2 } : undefined} />
        ))}
        {!slides.length && <div className="text-[14px] muted py-6">No slides yet. <Link className="underline" href={`/posts/${post.id}?lang=${k}`}>Add them</Link></div>}
      </div>
      {missingEnd && <div className="text-[13px]" style={{ color: "var(--warn)" }}>The {l.code} Tradr slide isn’t set. <Link className="underline" href="/settings">Add it in Settings</Link>.</div>}

      <button className={big} style={{ background: "var(--accent)", color: "var(--accent-ink)" }} onClick={save} disabled={!files?.length}>
        {files === null && slides.length ? <><Spinner size={18} /> Preparing {slides.length} slides…</> : <><Icon name="download" size={20} /> Save {slides.length} slides to Photos</>}
      </button>
      <button className={big} style={{ background: "var(--panel)", border: "1px solid var(--line-2)" }} onClick={copy} disabled={!caption}>
        <Icon name="copy" size={20} /> {copied ? "Caption copied" : caption ? "Copy caption" : "No caption yet"}
      </button>
      <a className="text-center text-[14px] font-semibold underline underline-offset-4 muted" href="instagram://camera">Open Instagram</a>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button className={big} style={{ background: "var(--s-scheduled)", color: "#fff" }} onClick={() => mark("scheduled")} disabled={!!busy}>
          {busy === "scheduled" ? <Spinner size={18} /> : null} Scheduled in Instagram
        </button>
        <button className={big} style={{ background: "var(--s-posted)", color: "#fff" }} onClick={() => mark("posted")} disabled={!!busy}>
          {busy === "posted" ? <Spinner size={18} /> : null} Posted
        </button>
      </div>

      <div className="flex items-center justify-between text-[13px] pt-1">
        <Link href={`/posts/${post.id}?lang=${k}`} className="muted underline underline-offset-4">Edit post</Link>
        <button className="muted underline underline-offset-4" onClick={goNext}>{next ? `Skip to next (${next.post.title || "Untitled"} · ${LANGS.find((x) => x.k === next.k)!.code})` : "Back to Batch"}</button>
      </div>
      <details className="text-[13px]">
        <summary className="muted cursor-pointer">Change status by hand</summary>
        <div className="mt-2"><StatusSetter post={post} k={k} /></div>
      </details>
    </div>
  );
}

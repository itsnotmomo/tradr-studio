"use client";

// Tradr Media's board (20 Nov 2026): one screen per platform (Instagram, X), each with To review / Scheduled /
// Posted / Pitches. Every draft goes to both platforms; each card shows that platform's own state and preview,
// and one obvious action. Hand edits (caption, X text, a swapped slide) are kept as before/after so the
// news-scout run learns from them (taste file).

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Spinner } from "@/components/ui";
import { Markdown } from "@/components/md";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { copyText } from "@/components/publish";
import { api, fetcher } from "@/lib/client/api";
import { imageFiles, toJpeg, uploadBlob } from "@/lib/client/upload";
import {
  IG_MAX_LEAD_MS, endSlideOf, isReel, onPlatform, platformState, stateLabel, tabOf, xFailed, PLATFORM_STATE_LABEL,
  type BoardTab, type NewsDesk, type NewsDraft, type NewsSlide, type NewsSuggestion, type Platform, type PlatformState,
} from "@/lib/news";
import { relTime } from "@/lib/time";

const KEY = "/api/news";
type Data = { drafts: NewsDraft[]; suggestions: NewsSuggestion[]; desk: NewsDesk & { rev: number }; now: number };
type Act = (d: NewsDraft, action: string, note?: string, extra?: Record<string, unknown>) => Promise<boolean>;

export const PLATFORMS: Record<Platform, { name: string; handle: string; path: string; icon: "instagram" | "xlogo" }> = {
  ig: { name: "Instagram", handle: "@tradr__app", path: "/instagram", icon: "instagram" },
  x: { name: "X", handle: "@tradr_app", path: "/x", icon: "xlogo" },
};
const TABS: [BoardTab, string, string][] = [["review", "To review", "Review"], ["scheduled", "Scheduled", "Scheduled"], ["posted", "Posted", "Posted"], ["pitches", "Pitches", "Pitches"]];
/** Pitches older than this are hidden (news goes stale); they stay in the data. */
const PITCH_FRESH = 3 * 864e5;

const STATE_TONE: Record<PlatformState, string> = {
  review: "var(--s-draft)", changes: "var(--s-ready)", ready: "var(--green)", failed: "var(--s-failed)",
  posting: "var(--s-publishing)", scheduled: "var(--s-scheduled)", posted: "var(--s-posted)", rejected: "var(--s-failed)",
};
/** To review: what needs you first. */
const REVIEW_ORDER: Record<PlatformState, number> = { failed: 0, ready: 1, review: 2, changes: 3, posting: 4, scheduled: 5, posted: 6, rejected: 7 };

export function useNews() {
  return useSWR<Data>(KEY, fetcher, {
    // Every 2 minutes while open (Mohamed, 25 Nov 2026: Upstash bandwidth), every 5 s while the poster on the Mac is
    // working on something; on opening and on coming back to the tab; never while the tab is hidden.
    refreshInterval: (d?: Data) => (d?.drafts.some((x) => x.post && (x.post.state === "queued" || x.post.state === "running")) ? 5_000 : 120_000),
    refreshWhenHidden: false,
    revalidateOnFocus: true,
  });
}

export function Board({ platform }: { platform: Platform }) {
  return <Suspense><BoardView platform={platform} /></Suspense>;
}

function BoardView({ platform }: { platform: Platform }) {
  const P = PLATFORMS[platform];
  const { data, error, mutate } = useNews();
  const params = useSearchParams();
  const router = useRouter();
  const only = params.get("id");
  const tab = (params.get("tab") as BoardTab) || "review";
  const setTab = (t: BoardTab) => router.replace(t === "review" ? P.path : `${P.path}?tab=${t}`, { scroll: false });
  const toast = useToast();
  const [showRejected, setShowRejected] = useState(false);

  const act: Act = async (d, action, note, extra) => {
    try {
      const next = await api<NewsDraft>(`${KEY}/${d.id}`, { method: "POST", body: { action, note, ...extra } });
      await mutate((x) => x && { ...x, drafts: x.drafts.map((y) => (y.id === d.id ? next : y)) }, { revalidate: false });
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
      return false;
    }
  };
  const remove = async (d: NewsDraft) => {
    try {
      await api(`${KEY}/${d.id}`, { method: "DELETE" });
      await mutate((x) => x && { ...x, drafts: x.drafts.filter((y) => y.id !== d.id) }, { revalidate: false });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  const now = data?.now ?? 0;
  const rows = useMemo(() => (data?.drafts ?? []).filter((d) => onPlatform(d, platform)).map((d) => ({ d, s: platformState(d, platform, now) })), [data, platform, now]);
  const pitches = (data?.suggestions ?? []).filter((s) => s.status === "pitch" && now - s.createdAt < PITCH_FRESH);
  const counts: Record<BoardTab, number> = {
    review: rows.filter((r) => r.s !== "rejected" && tabOf(r.s) === "review").length,
    scheduled: rows.filter((r) => tabOf(r.s) === "scheduled").length,
    posted: rows.filter((r) => r.s !== "rejected" && tabOf(r.s) === "posted").length,
    pitches: pitches.length,
  };
  const igAt = (d: NewsDraft) => d.post?.igAt ?? 0;
  let list = only ? rows.filter((r) => r.d.id === only) : rows.filter((r) => r.s !== "rejected" && tab !== "pitches" && tabOf(r.s) === tab);
  if (!only) {
    if (tab === "review") list = list.sort((a, b) => REVIEW_ORDER[a.s] - REVIEW_ORDER[b.s] || b.d.createdAt - a.d.createdAt);
    else if (tab === "scheduled") list = list.sort((a, b) => igAt(a.d) - igAt(b.d));
    else list = list.sort((a, b) => (platform === "ig" ? igAt(b.d) - igAt(a.d) : 0) || (b.d.postedAt ?? b.d.updatedAt) - (a.d.postedAt ?? a.d.updatedAt));
  }
  const rejected = tab === "review" && !only ? rows.filter((r) => r.s === "rejected").sort((a, b) => b.d.updatedAt - a.d.updatedAt) : [];
  const end = data ? endSlideOf(data.desk) : null;

  return (
    <div className="media news mx-auto w-full max-w-[1120px] px-4 md:px-8 pt-5 md:pt-9 pb-16">
      <header className="flex items-center gap-3">
        <span className="media-pf"><Icon name={P.icon} size={20} /></span>
        <div className="flex-1 min-w-0">
          <h1 className="serif text-[30px] md:text-[34px] leading-none">{P.name}</h1>
          <p className="text-[13px] muted mt-1 truncate">
            {P.handle}
            {data?.desk.lastRunAt ? <> · scout ran {relTime(data.desk.lastRunAt, now)}{data.desk.lastRunSummary ? `: ${data.desk.lastRunSummary}` : ""}</> : null}
          </p>
        </div>
      </header>

      <nav className="media-tabs" aria-label={`${P.name} views`}>
        {TABS.map(([t, label, short]) => (
          <button key={t} aria-pressed={!only && tab === t} onClick={() => setTab(t)} aria-label={label}>
            <i className="hidden sm:inline not-italic">{label}</i><i className="sm:hidden not-italic">{short}</i>{counts[t] > 0 && <span>{counts[t]}</span>}
          </button>
        ))}
      </nav>

      {error && <p className="text-[13px] text-[var(--danger)] py-6">{error.message}</p>}
      {!data && !error && <div className="py-20 flex justify-center muted"><Spinner size={20} /></div>}
      {only && <p className="text-[13px] pb-3"><Link className="underline underline-offset-2" href={P.path}>← All posts</Link></p>}

      {data && !only && tab === "pitches" && <PitchesPanel data={data} onChange={() => mutate()} />}

      {data && (only || tab !== "pitches") && (
        list.length === 0 && !rejected.length ? (
          <div className="media-empty">
            {only ? "This post no longer exists."
              : tab === "review" ? <>Nothing to review. The scout runs at 08:00 and 17:00, or say <b>make news posts</b> in Claude Code.</>
              : tab === "scheduled" ? (platform === "ig" ? "Nothing scheduled on Instagram." : "Nothing on its way to X.")
              : "Nothing posted yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {list.length === 0 && <div className="media-empty">Nothing to review.</div>}
            {list.map(({ d, s }) => <PostCard key={d.id} d={d} s={s} platform={platform} end={end?.url ?? null} now={now} act={act} remove={remove} />)}
            {rejected.length > 0 && (
              <>
                <button className="media-more" onClick={() => setShowRejected((x) => !x)}>Rejected · {rejected.length} {showRejected ? "▴" : "▾"}</button>
                {showRejected && rejected.map(({ d, s }) => <PostCard key={d.id} d={d} s={s} platform={platform} end={end?.url ?? null} now={now} act={act} remove={remove} />)}
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ---------- One post on one platform ----------

function PostCard({ d, s, platform, end, now, act, remove }: {
  d: NewsDraft; s: PlatformState; platform: Platform; end: string | null; now: number; act: Act; remove: (d: NewsDraft) => void;
}) {
  const [mode, setMode] = useState<"view" | "changes" | "post" | "edit">("view");
  const [note, setNote] = useState(d.changeNote || "");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const run = async (action: string, n?: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    const ok = await act(d, action, n, extra);
    setBusy(null);
    return ok;
  };
  const copy = async (what: string, text: string) => toast((await copyText(text)) ? `${what} copied.` : "Copy failed.", { ms: 1800 });
  // A Reel is its one video: no shared end slide.
  const reel = isReel(d);
  const slides: (NewsSlide & { fixed?: boolean })[] = [...d.slides, ...(end && !reel ? [{ url: end, kind: "image" as const, w: 1080, h: 1350, fixed: true }] : [])];
  const other: Platform = platform === "ig" ? "x" : "ig";
  const otherLabel = !onPlatform(d, other) ? "off" : stateLabel(d, other, now).replace(" · ready to post", "").replace(/^X failed$/, "failed");
  // The tweet failed after Instagram went through (24 Nov 2026): said loudly on both boards, never a quiet Instagram-only.
  const xFail = xFailed(d, now);
  const busyPost = inFlight(d);

  // The one obvious action for this state; everything else is quiet.
  const primary = (() => {
    if (s === "review") return <button className="btn primary" disabled={!!busy} onClick={() => run("approve")}>{busy === "approve" ? <Spinner /> : "Approve"}</button>;
    if (s === "ready" || s === "failed") return <button className="btn primary" disabled={!!busy || busyPost} onClick={() => setMode("post")}>{s === "failed" ? "Try posting again" : "Post"}</button>;
    if (s === "changes") return <button className="btn primary" disabled={!!busy} onClick={() => setMode("changes")}>Edit the note</button>;
    if (s === "rejected") return <button className="btn primary" disabled={!!busy} onClick={() => run("reopen")}>Back to review</button>;
    return null;
  })();

  return (
    <article className={`media-card ${platform}`} data-state={s} data-xfail={platform === "ig" && xFail ? "" : undefined}>
      <div className="media-card-preview">
        {platform === "ig" ? <Carousel slides={slides} reel={reel} /> : <TweetPreview d={d} hook={d.slides[0]} reel={reel} />}
      </div>

      <div className="media-card-body">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="media-state" style={{ "--s": STATE_TONE[s] } as React.CSSProperties}>{platform === "x" ? stateLabel(d, "x", now) : PLATFORM_STATE_LABEL[s]}</span>
          {platform === "ig" && xFail && <span className="media-state" style={{ "--s": STATE_TONE.failed } as React.CSSProperties}>X failed</span>}
          {reel && <span className="media-chip">Reel</span>}
          {d.tag && <span className="media-tag">{d.tag}</span>}
          {d.collab && <span className="news-collab">Collab @{d.collab.handle}</span>}
          {d.scout && <span className="media-chip">Scout</span>}
          <span className="flex-1" />
          <span className="text-[12px] faint whitespace-nowrap">{PLATFORMS[other].name}: {otherLabel}</span>
        </div>
        <h2 className="media-title">{d.title}</h2>

        <Status d={d} s={s} platform={platform} now={now} />
        {platform === "ig" && xFail && <div className="media-line danger"><b>X failed:</b> the tweet didn&apos;t go out, so this post is on Instagram only for now (the X board has it under To review). {d.post?.error}</div>}

        {mode === "post" ? (
          <PostWhen d={d} busy={busy === "post"} onCancel={() => setMode("view")}
            onPost={async (igAt, label) => {
              if (await run("post", undefined, igAt == null ? undefined : { igAt })) {
                setMode("view");
                toast(`Sent to the poster. Instagram goes live ${label}; ${d.xOff ? "it doesn't go to X (Instagram only)" : d.post?.tweetUrl ? "the tweet already went out, so it isn't sent again" : "the tweet goes out now"}.`, { ms: 4000 });
              }
            }} />
        ) : mode === "changes" ? (
          <div className="flex flex-col gap-2">
            <textarea className="news-input" rows={3} autoFocus placeholder="What should change? e.g. shorter headline, a different photo"
              value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="news-actions">
              <button className="btn primary" disabled={!note.trim() || !!busy}
                onClick={async () => { if (await run("changes", note)) { setMode("view"); toast("Saved. The next scout run redoes it, or say “fix it”.", { ms: 3000 }); } }}>
                {busy === "changes" ? <Spinner /> : "Send note"}
              </button>
              <button className="btn ghost" onClick={() => setMode("view")}>Cancel</button>
            </div>
          </div>
        ) : mode === "edit" ? (
          <EditPanel d={d} platform={platform} act={act} onDone={() => setMode("view")} />
        ) : (
          <div className="news-actions">
            {primary}
            {s === "review" && <button className="btn" disabled={!!busy} onClick={() => setMode("changes")}>Ask for changes</button>}
            {s === "changes" && <button className="btn ghost" disabled={!!busy} onClick={() => run("reopen")}>Cancel request</button>}
            {s === "ready" && <button className="btn ghost" disabled={!!busy} onClick={() => run("reopen")}>Back to review</button>}
            {(s === "scheduled" || s === "posted") && !busyPost && <button className="btn" disabled={!!busy} onClick={() => setMode("post")}>{platform === "ig" ? "Post again" : "Reschedule Instagram"}</button>}
            {d.post?.state === "queued" && <button className="btn ghost" disabled={!!busy} onClick={() => run("post-cancel")}>Cancel post</button>}
            {s !== "posting" && s !== "rejected" && <button className="btn ghost" disabled={!!busy || busyPost} onClick={() => setMode("edit")}><Icon name="edit" size={15} /> Edit</button>}
            {s === "review" && <button className="btn ghost danger" disabled={!!busy} onClick={() => run("reject")}>Reject</button>}
            {s === "rejected" && <button className="btn ghost danger" onClick={() => remove(d)}>Delete</button>}
          </div>
        )}

        {platform === "ig"
          ? <TextBlock label="Caption" text={d.caption} onCopy={() => copy("Caption", d.caption)} />
          : <div className="flex items-center gap-2 text-[12.5px] muted">{d.x.length}/280 · {reel ? "the video goes with it" : "the hook slide goes with it"}<span className="flex-1" /><button className="btn sm" onClick={() => copy("X text", d.x)}><Icon name="copy" size={14} /> Copy</button></div>}

        <details className="media-details">
          <summary>Sources and facts · {d.sources.length}</summary>
          <div className="flex flex-col gap-3 pt-2">
            {(d.confirmed.length > 0 || d.reported.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {d.confirmed.length > 0 && <Facts label="Confirmed" tone="var(--s-posted)" items={d.confirmed} />}
                {d.reported.length > 0 && <Facts label="Reported, not confirmed" tone="var(--s-ready)" items={d.reported} />}
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {d.sources.map((x) => (
                <li key={x.url} className="min-w-0"><a href={x.url} target="_blank" rel="noreferrer" className="news-src"><Icon name="ext" size={13} /> <span className="truncate">{x.label}</span></a></li>
              ))}
            </ul>
            <ul className="flex flex-col gap-1 text-[12.5px] muted">
              {d.photos.map((p, i) => (
                <li key={i} className="break-words"><span className="text-[var(--ink)]">{p.what}:</span> {p.credit}{p.license ? ` · ${p.license}` : ""} <a href={p.page || p.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a></li>
              ))}
            </ul>
            <div className="text-[11.5px] faint">Drafted {relTime(d.createdAt, now)}{d.version > 1 ? ` · version ${d.version}` : ""}{d.edits?.length ? ` · ${d.edits.length} hand edit${d.edits.length === 1 ? "" : "s"}` : ""}</div>
          </div>
        </details>
      </div>
    </article>
  );
}

/** The line under the title: what's happening on this platform, in words. */
function Status({ d, s, platform, now }: { d: NewsDraft; s: PlatformState; platform: Platform; now: number }) {
  const p = d.post;
  const when = (ms: number) => `${WHEN_FMT.format(ms)} Rome`;
  if (s === "changes") return <div className="news-note"><b>Changes asked:</b> “{d.changeNote}” The next scout run redoes it, or say <b>fix it</b> in Claude Code.</div>;
  if (s === "failed") return <div className="media-line danger"><b>{platform === "x" && p?.igScheduledAt ? "X failed (Instagram went through):" : "Posting stopped:"}</b> {p?.error}</div>;
  if (s === "posting") return <div className="media-line flex items-center gap-2"><Spinner /> {p?.state === "queued" ? "Waiting for the poster on the Mac (within a minute while it's on)." : "Posting now…"}</div>;
  if (platform === "ig") {
    if (s === "scheduled" && p) return <div className="media-line">Goes live <b>{when(p.igAt)}</b> ({relTime(p.igAt, now)}). Add the music from the phone: Profile → ☰ → Scheduled content.</div>;
    if (s === "posted") return <div className="media-line">{p?.igScheduledAt ? <>Went live {when(p.igAt)}.</> : <>Marked posted {d.postedAt ? relTime(d.postedAt, now) : ""}.</>}</div>;
  } else {
    if (s === "posted") return <div className="media-line">{p?.tweetUrl ? <><a className="underline underline-offset-2" href={p.tweetUrl} target="_blank" rel="noreferrer">Tweet on @tradr_app</a> · {relTime(p.updatedAt, now)}</> : <>Marked posted {d.postedAt ? relTime(d.postedAt, now) : ""}.</>}</div>;
  }
  if ((s === "review" || s === "ready") && d.bestTime && d.bestTime.at - now > EARLIEST) {
    return <div className="media-line"><span className="muted">Best time</span> <b>{when(d.bestTime.at)}</b>{d.bestTime.why ? <span className="muted"> · {d.bestTime.why}</span> : null}</div>;
  }
  return null;
}

// ---------- Previews ----------

/** Instagram: the carousel at a size you can read, swipe or arrows, tap for full screen. */
function Carousel({ slides, reel = false }: { slides: (NewsSlide & { fixed?: boolean })[]; reel?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    const k = Math.max(0, Math.min(slides.length - 1, n));
    el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className={`media-carousel${reel ? " reel" : ""}`}>
      <div ref={ref} className="media-carousel-track" onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
        {slides.map((s, k) => (
          <button key={s.url + k} className="media-carousel-slide" onClick={() => setOpen(k)} aria-label={`Slide ${k + 1}, full screen`}>
            {s.kind === "video"
              ? <><img src={s.poster || ""} alt="" loading="lazy" /><span className="news-play">▶</span></>
              : <img src={s.url} alt="" loading={k < 2 ? "eager" : "lazy"} />}
          </button>
        ))}
      </div>
      <span className="media-count">{reel ? "Reel · 9:16" : <>{i + 1}/{slides.length}{slides[i]?.fixed ? " · fixed" : ""}</>}</span>
      {i > 0 && <button className="media-arrow l" onClick={() => go(i - 1)} aria-label="Previous slide"><Icon name="left" size={18} /></button>}
      {i < slides.length - 1 && <button className="media-arrow r" onClick={() => go(i + 1)} aria-label="Next slide"><Icon name="right" size={18} /></button>}
      <div className="media-dots" aria-hidden>{slides.map((_, k) => <i key={k} data-on={k === i || undefined} />)}</div>
      {open !== null && <Lightbox slides={slides} start={open} reel={reel} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** X: the tweet as it will look, with the hook slide attached. */
function TweetPreview({ d, hook, reel = false }: { d: NewsDraft; hook?: NewsSlide; reel?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="media-tweet">
      <div className="flex items-center gap-2.5">
        <img src="/pwa-192.png" alt="" className="media-tweet-av" />
        <div className="min-w-0 leading-tight"><div className="font-bold text-[15px]">Tradr</div><div className="text-[13.5px] muted">@tradr_app</div></div>
      </div>
      <p className="media-tweet-text">{d.x}</p>
      {hook && (
        <button className="media-tweet-img" onClick={() => setOpen(true)} aria-label="Image, full screen">
          <img src={hook.kind === "video" ? hook.poster || "" : hook.url} alt="" />
        </button>
      )}
      {open && hook && <Lightbox slides={[hook]} start={0} reel={reel} onClose={() => setOpen(false)} />}
    </div>
  );
}

function TextBlock({ label, text, onCopy }: { label: string; text: string; onCopy: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="news-label flex-1 mb-0">{label}</div>
        <button className="btn sm" onClick={onCopy}><Icon name="copy" size={14} /> Copy</button>
      </div>
      <p className={`news-text ${more ? "" : "clamped"}`} onClick={() => setMore(true)}>{text}</p>
    </div>
  );
}

// ---------- Edit by hand (kept as feedback for the scout) ----------

function EditPanel({ d, platform, act, onDone }: { d: NewsDraft; platform: Platform; act: Act; onDone: () => void }) {
  const field = platform === "ig" ? "caption" : "x";
  const [text, setText] = useState(d[field]);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [slot, setSlot] = useState(0);
  const tooLong = field === "x" && text.trim().length > 280;
  const save = async () => {
    setBusy("text");
    const ok = text.trim() === d[field].trim() || (await act(d, "edit", undefined, { field, value: text }));
    setBusy(null);
    if (ok) { toast("Saved. The scout learns from this edit.", { ms: 2500 }); onDone(); }
  };
  const swap = async (files: FileList | null) => {
    const f = imageFiles(files)[0];
    if (!f) return;
    setBusy("slide");
    try {
      const { blob, w, h } = await toJpeg(f, 0.92);
      const url = await uploadBlob(blob, `news/${d.id}/hand-${Date.now()}.jpg`);
      if (await act(d, "swapSlide", undefined, { index: slot, url, w, h })) toast(`Slide ${slot + 1} replaced. The scout learns from this too.`, { ms: 2500 });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };
  const pick = (k: number) => { setSlot(k); input.current?.click(); };
  return (
    <div className="media-edit">
      <div className="news-label">{field === "x" ? `X text · ${text.trim().length}/280` : "Caption"}</div>
      <textarea className="news-input" rows={field === "x" ? 4 : 9} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="news-label mt-1">{platform === "ig" ? "Replace a slide" : "Replace the image"}</div>
      <div className="media-edit-slides">
        {(platform === "ig" ? d.slides : d.slides.slice(0, 1)).map((s, k) => (
          <button key={s.url} onClick={() => pick(k)} disabled={!!busy || s.kind === "video"} aria-label={`Replace slide ${k + 1}`}>
            <img src={s.kind === "video" ? s.poster || "" : s.url} alt="" />
            <span>{busy === "slide" && slot === k ? <Spinner /> : <><Icon name="image" size={13} /> {k + 1}</>}</span>
          </button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => swap(e.target.files)} />
      <p className="text-[12px] muted">Use a finished 1080 × 1350 slide. Your edits are saved as before/after in the taste file, so the scout learns from them.</p>
      <div className="news-actions">
        <button className="btn primary" disabled={!!busy || !text.trim() || tooLong} onClick={save}>{busy === "text" ? <Spinner /> : "Save"}</button>
        <button className="btn ghost" disabled={!!busy} onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

// ---------- Pitches (shared by both platforms) ----------

function PitchesPanel({ data, onChange }: { data: Data; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const toast = useToast();
  const now = data.now;
  const pitches = data.suggestions.filter((s) => s.status === "pitch" && now - s.createdAt < PITCH_FRESH).sort((a, b) => b.createdAt - a.createdAt);
  const queued = data.suggestions.filter((s) => s.status === "queued").sort((a, b) => a.createdAt - b.createdAt);
  const recent = data.suggestions.filter((s) => (s.status === "done" || s.status === "skipped") && s.pitch !== "dismissed" && now - s.updatedAt < 3 * 864e5);
  const call = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try { await fn(); if (done) toast(done, { ms: 3000 }); onChange(); } catch (e) { toast((e as Error).message, { tone: "error" }); } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-6">
      <section className="media-panel">
        <div className="flex gap-2 items-end">
          <textarea className="news-input" rows={1} placeholder="Suggest a story (link or line)"
            value={text} onChange={(e) => setText(e.target.value)}
            onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) call("add", () => api(`${KEY}/suggest`, { body: { text } }).then(() => setText("")), "Queued. The next run makes it first."); }} />
          <button className="btn primary" disabled={!text.trim() || !!busy} onClick={() => call("add", () => api(`${KEY}/suggest`, { body: { text } }).then(() => setText("")), "Queued. The next run makes it first.")}>{busy === "add" ? <Spinner /> : "Queue"}</button>
        </div>
      </section>

      <section>
        <h3 className="media-h3">Pitches from the scout</h3>
        <p className="text-[13px] muted mb-3">Verified stories that didn’t make the cut. <b>Make this one</b> queues it for the next run (or say “make this one” in Claude Code). Dismissed ones teach the scout what you don’t want.</p>
        {pitches.length === 0 ? <div className="media-empty !py-8">No pitches right now.</div> : (
          <ul className="flex flex-col gap-2">
            {pitches.map((s) => (
              <li key={s.id} className="media-pitch">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{s.text}</div>
                  <div className="text-[12.5px] muted mt-1">
                    {s.note}{s.note && s.url ? " · " : ""}{s.url && <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a>}
                    <span className="faint"> · {relTime(s.createdAt, now)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-none">
                  <button className="btn primary sm" disabled={!!busy} onClick={() => call(s.id, () => api(`${KEY}/suggest`, { body: { action: "make", id: s.id } }), "Queued. The next run makes it (or say “make news posts”).")}>{busy === s.id ? <Spinner /> : "Make this one"}</button>
                  <button className="icon-btn" aria-label="Dismiss" disabled={!!busy} onClick={() => call("x" + s.id, () => api(`${KEY}/suggest?id=${s.id}`, { method: "DELETE" }))}><Icon name="x" size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(queued.length > 0 || recent.length > 0) && (
        <section>
          <h3 className="media-h3">Queued and recent</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {[...queued, ...recent].map((s) => (
              <li key={s.id} className="news-sug">
                <span className={`news-sug-dot ${s.status}`} />
                <span className="flex-1 min-w-0 break-words">
                  {s.text}
                  <span className="block muted text-[12px] mt-0.5">
                    {s.status === "queued" ? (s.pitch === "chosen" ? "Pitch · queued for the next run" : "Queued for the next run") : s.status === "skipped" ? `Skipped: ${s.note}` : "Drafted"}
                  </span>
                </span>
                {s.status === "queued" && <button className="icon-btn" aria-label="Remove" onClick={() => call("d" + s.id, () => api(`${KEY}/suggest?id=${s.id}`, { method: "DELETE" }))}><Icon name="x" size={15} /></button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- Style (its own screen) ----------

export function StyleScreen() {
  const { data, mutate } = useNews();
  return (
    <div className="media news mx-auto w-full max-w-[860px] px-4 md:px-8 pt-5 md:pt-9 pb-16">
      <header className="flex items-center gap-3 mb-4">
        <span className="media-pf"><Icon name="style" size={20} /></span>
        <div><h1 className="serif text-[30px] md:text-[34px] leading-none">Style</h1><p className="text-[13px] muted mt-1">End slide, references, the taste file and the style guide every draft follows.</p></div>
      </header>
      {data ? <StylePanel desk={data.desk} onChange={() => mutate()} /> : <div className="py-20 flex justify-center muted"><Spinner size={20} /></div>}
    </div>
  );
}

// Every draft keeps its Post button (Mohamed, 17 Nov 2026), so a posted one can be posted or rescheduled again.
// It only waits while a post is on its way.
const inFlight = (d: NewsDraft) => d.post?.state === "queued" || d.post?.state === "running";

const ROME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ---------- Post: when the Instagram post goes live ----------

const TZ = "Europe/Rome";
const MIN = 60e3, HOUR = 3600e3;
/** Earliest choice: Instagram's scheduler needs 20 minutes' notice, the poster a minute or two (server floor: IG_MIN_LEAD_MS). */
const EARLIEST = 30 * MIN;

/** The moment a Rome wall-clock time happens (handles the summer/winter change). */
function romeTime(y: number, mo: number, day: number, h: number, mi: number) {
  const guess = Date.UTC(y, mo - 1, day, h, mi);
  const off = (ms: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(ms).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  const t = guess - off(guess);
  return guess - off(t);
}
function romeParts(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
    .formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute };
}
const ceil5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * (5 * MIN);
const WHEN_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const HM = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (ms: number) => { const r = romeParts(ms); return `${r.y}-${pad(r.mo)}-${pad(r.d)}T${pad(r.h)}:${pad(r.mi)}`; };

type WhenKey = "best" | "30m" | "1h" | "3h" | "tonight" | "tomorrow" | "24h" | "custom";

/** The choices, worked out from "now". Tonight = 21:00 Rome (15:00 New York), shown while it's at least 30 minutes away;
 *  tomorrow = 18:00 Rome (noon New York), inside Polymarket's posting window (playbook §2). */
function whenChoices(now: number, best?: NewsDraft["bestTime"]): { key: WhenKey; label: string; at: number }[] {
  const r = romeParts(now);
  const tonight = romeTime(r.y, r.mo, r.d, 21, 0);
  const tmr = romeParts(now + 24 * HOUR);
  const out: { key: WhenKey; label: string; at: number }[] = [];
  // The run's suggested slot comes first while it's still far enough ahead.
  if (best && best.at - now >= EARLIEST && best.at - now <= IG_MAX_LEAD_MS) out.push({ key: "best", label: `Best: ${WHEN_FMT.format(best.at)}`, at: best.at });
  out.push(
    { key: "30m", label: "In 30 minutes", at: ceil5(now + 30 * MIN) },
    { key: "1h", label: "In 1 hour", at: ceil5(now + HOUR) },
    { key: "3h", label: "In 3 hours", at: ceil5(now + 3 * HOUR) },
  );
  if (tonight - now >= EARLIEST) out.push({ key: "tonight", label: `Tonight ${HM.format(tonight)}`, at: tonight });
  out.push({ key: "tomorrow", label: `Tomorrow ${HM.format(romeTime(tmr.y, tmr.mo, tmr.d, 18, 0))}`, at: romeTime(tmr.y, tmr.mo, tmr.d, 18, 0) });
  out.push({ key: "24h", label: "In 24 hours", at: ceil5(now + 24 * HOUR) });
  return out;
}

/** Opens on Post: pick when Instagram goes live (default 24 h), then Post. The tweet goes out at once, unless it already went out. */
function PostWhen({ d, busy, onPost, onCancel }: {
  d: NewsDraft; busy: boolean; onPost: (igAt: number | null, label: string) => void; onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20_000); return () => clearInterval(t); }, []);
  const [key, setKey] = useState<WhenKey>(() => (whenChoices(Date.now(), d.bestTime).some((c) => c.key === "best") ? "best" : "24h"));
  const [custom, setCustom] = useState(() => toLocalInput(ceil5(Date.now() + 2 * HOUR)));
  const already = d.post?.state === "failed" && d.post.igScheduledAt ? d.post : null; // a retry: Instagram is done
  const tweeted = !!d.post?.tweetUrl; // posting again never sends the tweet twice
  const choices = whenChoices(now, d.bestTime);
  const parseCustom = () => {
    const m = custom.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    return m ? romeTime(+m[1], +m[2], +m[3], +m[4], +m[5]) : NaN;
  };
  const at = key === "custom" ? parseCustom() : choices.find((c) => c.key === key)?.at ?? NaN;
  const problem = already ? null
    : !Number.isFinite(at) ? "Pick a date and time."
    : at - now < EARLIEST ? "At least 30 minutes from now (Instagram needs 20 minutes' notice)."
    : at - now > IG_MAX_LEAD_MS ? "Instagram schedules at most 29 days ahead."
    : null;
  const label = `${WHEN_FMT.format(already ? already.igAt : at)} Rome`;

  return (
    <div className="news-when">
      {already ? (
        <p className="text-[13.5px]">Instagram is already scheduled for <b>{label}</b>. This posts the tweet.</p>
      ) : <>
        <div className="news-label">Instagram goes live</div>
        <div className="news-when-opts" role="radiogroup" aria-label="When the Instagram post goes live">
          {choices.map((c) => (
            <button key={c.key} role="radio" aria-checked={key === c.key} onClick={() => setKey(c.key)}>{c.label}</button>
          ))}
          <button role="radio" aria-checked={key === "custom"} onClick={() => setKey("custom")}>Custom</button>
        </div>
        {key === "custom" && (
          <label className="news-when-custom">
            <input type="datetime-local" className="news-input" value={custom} step={300}
              min={toLocalInput(now + EARLIEST)} max={toLocalInput(now + IG_MAX_LEAD_MS)}
              onChange={(e) => setCustom(e.target.value)} />
            <span className="text-[12.5px] muted">Rome time</span>
          </label>
        )}
        <p className="text-[13px] muted">
          {problem ? <span className="text-[var(--danger)]">{problem}</span> : <>Goes live <b className="text-[var(--ink)]">{label}</b> ({relTime(at, now)}). {tweeted ? "The tweet already went out, so it isn't sent again." : "The tweet goes out now."}</>}
        </p>
      </>}
      <div className="news-actions">
        <button className="btn primary" disabled={busy || !!problem}
          onClick={() => {
            // Relative choices are worked out again at the moment of the tap.
            const t = Date.now();
            const fresh = key === "custom" ? parseCustom() : whenChoices(t, d.bestTime).find((c) => c.key === key)?.at ?? at;
            onPost(already ? null : fresh, `${WHEN_FMT.format(already ? already.igAt : fresh)} Rome`);
          }}>
          {busy ? <Spinner /> : already ? "Post the tweet" : "Post"}
        </button>
        <button className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Where the one-button post is: Instagram (scheduled in Instagram's own scheduler at the picked time) and the tweet. */
function PostStatus({ d, now }: { d: NewsDraft; now: number }) {
  const p = d.post!;
  const live = ROME.format(p.igAt) + " Rome";
  return (
    <div className="news-note flex flex-col gap-1.5">
      {p.state === "queued" && <div><b>Waiting for the poster on the Mac.</b> It picks this up within a minute while the Mac is on.</div>}
      {p.state === "running" && <div className="flex items-center gap-2"><Spinner /> <b>Posting now…</b></div>}
      {p.state === "failed" && <div><b>Posting stopped:</b> {p.error}</div>}
      <div>
        Instagram: {p.igScheduledAt
          ? <>scheduled on <b>@tradr__app</b>, goes live <b>{live}</b> ({relTime(p.igAt, now)}). Add the music from the phone: Profile → ☰ → Scheduled content.</>
          : <>to be scheduled for {live}.</>}
      </div>
      <div>X: {p.tweetUrl ? <a className="underline underline-offset-2" href={p.tweetUrl} target="_blank" rel="noreferrer">tweet posted on @tradr_app</a> : "not posted yet."}</div>
    </div>
  );
}


function Lightbox({ slides, start, reel = false, onClose }: { slides: NewsSlide[]; start: number; reel?: boolean; onClose: () => void }) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDialogElement>(null);
  const touch = useRef<number | null>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(slides.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [slides.length]);
  const s = slides[i];
  return (
    <dialog ref={ref} className="news-lightbox" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) setI((x) => Math.max(0, Math.min(slides.length - 1, x + (dx < 0 ? 1 : -1))));
        touch.current = null;
      }}>
      <div className={`news-lb-frame${reel ? " reel" : ""}`}>
        {s.kind === "video"
          ? <video key={s.url} src={s.url} poster={s.poster || undefined} controls autoPlay playsInline />
          : <img key={s.url} src={s.url} alt="" />}
      </div>
      <div className="news-lb-bar">
        <button className="icon-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous"><Icon name="left" /></button>
        <span>{i + 1} / {slides.length}</span>
        <button className="icon-btn" disabled={i === slides.length - 1} onClick={() => setI(i + 1)} aria-label="Next"><Icon name="right" /></button>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
    </dialog>
  );
}


function Facts({ label, tone, items }: { label: string; tone: string; items: string[] }) {
  return (
    <div>
      <div className="news-label" style={{ color: tone }}>{label}</div>
      <ul className="news-facts">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}


// ---------- Style: end slide, guide, references ----------

function StylePanel({ desk, onChange }: { desk: NewsDesk; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pending = desk.refs.filter((r) => !desk.guideRefIds.includes(r.id)).length;
  const post = async (b: unknown) => {
    try {
      await api(`${KEY}/desk`, { body: b });
      onChange();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const add = async (list: FileList | null) => {
    const files = imageFiles(list);
    if (!files.length) return;
    setBusy(true);
    try {
      const images = [];
      for (const f of files) {
        const { blob, w, h } = await toJpeg(f, 0.88);
        images.push({ url: await uploadBlob(blob, `news-style/${crypto.randomUUID()}.jpg`), w, h });
      }
      await post({ action: "addRefs", images, note });
      setNote("");
      toast(`${files.length} added. The next run updates the guide.`, { ms: 2500 });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-2">
      <section>
        <h3 className="news-h3">Last slide</h3>
        <p className="text-[13px] muted mb-2.5">{desk.endChoice ? "Chosen. It ends every post." : "Pick one. Until you do, the first is used."}</p>
        {desk.endOptions.length === 0 ? <p className="text-[13px] muted">No options yet.</p> : (
          <div className="grid grid-cols-3 gap-2.5">
            {desk.endOptions.map((o, i) => {
              const on = (desk.endChoice ?? desk.endOptions[0].id) === o.id;
              return (
                <button key={o.id} className={`news-end ${on ? "on" : ""}`} onClick={() => post({ action: "chooseEnd", id: o.id })} aria-pressed={on}>
                  <img src={o.url} alt="" />
                  <span>{on && desk.endChoice ? "✓ Chosen" : `Option ${i + 1}`}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="news-h3">References</h3>
        <p className="text-[13px] muted mb-2.5">Drop posts you like. The next run reads them and updates the guide{pending ? ` (${pending} new not in it yet)` : ""}.</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input className="news-input flex-1" placeholder="Optional: what you like about it" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Spinner /> : <><Icon name="plus" size={15} /> Add screenshots</>}</button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </div>
        {desk.refs.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {desk.refs.map((r) => (
              <figure key={r.id} className="news-ref">
                <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt="" loading="lazy" /></a>
                {!desk.guideRefIds.includes(r.id) && <span className="news-new">New</span>}
                <button className="news-ref-x" aria-label="Remove" onClick={() => post({ action: "removeRef", id: r.id })}><Icon name="x" size={13} /></button>
                {r.note && <figcaption>{r.note}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="news-h3">Taste</h3>
        <p className="text-[13px] muted mb-2.5">What the news-scout run has learned from your approvals, rejections and notes. It reads this every run.{desk.tasteUpdatedAt ? ` Updated ${new Date(desk.tasteUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}</p>
        <div className="news-guide">{desk.taste ? <Markdown text={desk.taste} /> : <span className="muted">Nothing learned yet.</span>}</div>
      </section>

      <section>
        <h3 className="news-h3">Style guide</h3>
        <p className="text-[13px] muted mb-2.5">Every draft follows this.{desk.guideUpdatedAt ? ` Updated ${new Date(desk.guideUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}</p>
        <div className="news-guide">{desk.guide ? <Markdown text={desk.guide} /> : <span className="muted">Not written yet.</span>}</div>
      </section>
    </div>
  );
}

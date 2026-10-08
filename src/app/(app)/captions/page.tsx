"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PreviewThumb } from "@/components/slide-viewer";
import { ReelBadge } from "@/components/post-card";
import { slotTimeLabel } from "@/components/publish";
import { PageHeader, Spinner, StatusPill } from "@/components/ui";
import { useToast } from "@/components/toast";
import { patchPost, useAppState } from "@/lib/client/state";
import { POST_ORDER, defaultRange, rangeQuery, sequence, type Range } from "@/lib/client/sequence";
import { buildCaption, charCount, hashtagCount } from "@/lib/caption";
import { CAPTION_MAX, HASHTAG_MAX } from "@/lib/rules";
import { LANGS } from "@/lib/langs";
import { slotName } from "@/lib/slots";
import { isLocked, statusOf } from "@/lib/status";
import { fmtDate, parseYmd, ymd } from "@/lib/time";
import type { Lang, Post, Settings } from "@/lib/types";

export default function CaptionsPage() {
  return <Suspense><Captions /></Suspense>;
}

/** Every caption in a range, all three languages, for proofreading. Spellcheck only, no rewriting. */
function Captions() {
  const { data } = useAppState();
  const router = useRouter();
  const params = useSearchParams();
  const range: Range = params.get("from") && params.get("to") ? { from: params.get("from")!, to: params.get("to")! } : defaultRange(7);
  const days = Math.round((parseYmd(range.to).getTime() - parseYmd(range.from).getTime()) / 864e5) + 1;
  const today = ymd(new Date());
  const preset = range.from === today && days === 7 ? 7 : range.from === today && days === 14 ? 14 : null;
  const setRange = (r: Range) => router.replace(`/captions?${rangeQuery(r)}`, { scroll: false });

  const posts = useMemo(() => (data ? [...new Map(sequence(data.posts, range).map((x) => [x.post.id, x.post])).values()] : []), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;

  const issues = posts.reduce((n, p) => n + POST_ORDER.filter((k) => problemsOf(p.variants[k]).length).length, 0);
  const byDay = new Map<string, Post[]>();
  for (const p of posts) byDay.set(p.date!, [...(byDay.get(p.date!) || []), p]);

  return (
    <div className="max-w-[860px]">
      <PageHeader title="Captions" sub="Proofread every caption in the range. Edits save on their own; misspellings are underlined in each field’s language." />
      <div className="px-4 md:px-6 flex flex-col gap-3 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Range">
            <button aria-pressed={preset === 7} onClick={() => setRange(defaultRange(7))}>Next 7 days</button>
            <button aria-pressed={preset === 14} onClick={() => setRange(defaultRange(14))}>Next 14 days</button>
          </div>
          <div className="flex items-center gap-1.5 text-[13px]">
            <input type="date" className="field !w-auto !min-h-[32px] !py-1" value={range.from} aria-label="From" onChange={(e) => e.target.value && setRange({ from: e.target.value, to: e.target.value > range.to ? e.target.value : range.to })} />
            <span className="muted">to</span>
            <input type="date" className="field !w-auto !min-h-[32px] !py-1" value={range.to} min={range.from} aria-label="To" onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
          </div>
          <span className="text-[12.5px] ml-auto" style={issues ? { color: "var(--danger)", fontWeight: 600 } : { color: "var(--muted)" }}>
            {posts.length} item{posts.length === 1 ? "" : "s"} · {issues ? `${issues} caption${issues === 1 ? "" : "s"} flagged` : "nothing flagged"}
          </span>
        </div>

        {!posts.length && <div className="muted text-center py-10">Nothing planned in this range.</div>}
        {[...byDay.entries()].map(([d, list]) => (
          <section key={d} className="flex flex-col gap-3">
            <h2 className="font-bold text-[14px] pt-2">{fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}{d === today && <span className="muted font-medium"> · today</span>}</h2>
            {list.map((p) => (
              <article key={p.id} className="card overflow-hidden">
                <header className="flex items-center gap-3 p-2.5 pr-3 border-b" style={{ borderColor: "var(--line)" }}>
                  <PreviewThumb post={p} lang="it" className="w-10" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold break-words md:truncate">{p.title || "Untitled"}</div>
                    <div className="text-[12px] muted flex items-center gap-1.5">
                      {fmtDate(p.date!, { weekday: "short", day: "numeric", month: "short" })} · {p.kind === "reel" ? <ReelBadge /> : slotName(p.slot)}
                    </div>
                  </div>
                  <Link href={`/posts/${p.id}`} className="btn small ghost">Edit</Link>
                </header>
                <div className="flex flex-col">
                  {POST_ORDER.map((k) => <LangCaption key={k} post={p} k={k} settings={data.settings} />)}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

type Parts = { comment: string; tradr: string; hashtags: string };
const FIELDS: { f: keyof Parts; label: string }[] = [
  { f: "comment", label: "About this post" },
  { f: "tradr", label: "About Tradr" },
  { f: "hashtags", label: "Hashtags" },
];

function problemsOf(parts: Parts) {
  const cap = buildCaption(parts);
  const out: string[] = [];
  if (!cap) out.push("Caption is empty.");
  else {
    if (!parts.comment.trim()) out.push("“About this post” is empty.");
    const chars = charCount(cap), tags = hashtagCount(cap);
    if (chars > CAPTION_MAX) out.push(`${chars.toLocaleString()} characters. The limit is ${CAPTION_MAX.toLocaleString()}.`);
    if (tags > HASHTAG_MAX) out.push(`${tags} hashtags. The limit is ${HASHTAG_MAX}.`);
  }
  return out;
}

/** One language's caption: three spellchecked fields that save on their own. */
function LangCaption({ post, k, settings }: { post: Post; k: Lang; settings: Settings }) {
  const toast = useToast();
  const v = post.variants[k];
  const l = LANGS.find((x) => x.k === k)!;
  const locked = isLocked(v);
  const [parts, setParts] = useState<Parts>({ comment: v.comment, tradr: v.tradr, hashtags: v.hashtags });
  const [saving, setSaving] = useState<"idle" | "pending" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Partial<Parts>>({});

  // Take changes made elsewhere, unless there's an unsaved edit here.
  useEffect(() => {
    if (Object.keys(pending.current).length) return;
    setParts({ comment: v.comment, tradr: v.tradr, hashtags: v.hashtags });
  }, [v.comment, v.tradr, v.hashtags]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!Object.keys(p).length) return;
    pending.current = {};
    try {
      await patchPost(post.id, { variants: { [k]: p } });
      setSaving("saved");
    } catch (e) {
      setSaving("idle");
      toast(`${l.code} “${post.title || "Untitled"}”: ${(e as Error).message}`, { tone: "error" });
    }
  }, [k, l.code, post.id, post.title, toast]);
  useEffect(() => () => void flush(), [flush]); // save when leaving the page

  const set = (f: keyof Parts, val: string) => {
    setParts((x) => ({ ...x, [f]: val }));
    pending.current[f] = val;
    setSaving("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  const cap = buildCaption(parts);
  const chars = charCount(cap), tags = hashtagCount(cap);
  const problems = problemsOf(parts);
  return (
    <div className="px-3 py-3 border-b last:border-b-0 flex flex-col gap-2" style={{ borderColor: "var(--line)", background: problems.length ? "var(--danger-bg)" : undefined }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-[13px]">{l.code}</b>
        <span className="text-[12px] muted min-w-0 flex-1">{l.handle} · {slotTimeLabel(settings, k, post)}</span>
        <span className="text-[11.5px] muted">{saving === "pending" ? "Saving…" : saving === "saved" ? "Saved" : ""}</span>
        <StatusPill s={statusOf(post, k, settings)} />
      </div>
      {problems.length > 0 && (
        <ul className="text-[12.5px] font-semibold flex flex-col gap-0.5" style={{ color: "var(--danger)" }}>
          {problems.map((x) => <li key={x}>⚠ {x}</li>)}
        </ul>
      )}
      {FIELDS.map(({ f, label }) => (
        <div key={f}>
          <label className="text-[11.5px] font-semibold muted" htmlFor={`cap_${post.id}_${k}_${f}`}>{f === "comment" && post.kind === "reel" ? "About this reel" : label}</label>
          <AutoText id={`cap_${post.id}_${k}_${f}`} lang={k} value={parts[f]} readOnly={locked} onBlur={flush} onChange={(val) => set(f, val)}
            placeholder={f === "comment" ? "Empty" : "Empty (set a default in Settings)"} />
        </div>
      ))}
      <div className="flex gap-4 text-[12px] muted">
        <span style={chars > CAPTION_MAX ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{chars.toLocaleString()} / {CAPTION_MAX.toLocaleString()} characters</span>
        <span style={tags > HASHTAG_MAX ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{tags} / {HASHTAG_MAX} hashtags</span>
      </div>
    </div>
  );
}

/** A textarea that grows to fit its text, so a page of captions scrolls as one. */
function AutoText({ id, lang, value, readOnly, onChange, onBlur, placeholder }: { id: string; lang: Lang; value: string; readOnly: boolean; onChange: (v: string) => void; onBlur: () => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <textarea ref={ref} id={id} lang={lang} spellCheck autoCorrect="off" autoCapitalize="sentences" rows={1}
      className="field !min-h-0 resize-none overflow-hidden text-[14px] leading-[1.45]" value={value} readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} />
  );
}

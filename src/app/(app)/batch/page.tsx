"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { PreviewThumb } from "@/components/slide-viewer";
import { ReelBadge } from "@/components/post-card";
import { slotTimeLabel } from "@/components/publish";
import { PageHeader, Spinner, StatusPill } from "@/components/ui";
import { useAppState } from "@/lib/client/state";
import { POST_ORDER, defaultRange, rangeQuery, sequence, type Range } from "@/lib/client/sequence";
import { LANGS } from "@/lib/langs";
import { slotName } from "@/lib/slots";
import { isDone, statusOf } from "@/lib/status";
import { fmtDate, parseYmd, ymd } from "@/lib/time";
import type { Post } from "@/lib/types";

export default function BatchPage() {
  return <Suspense><Batch /></Suspense>;
}

/** Every post in a range, in slot order, for scheduling them all in Instagram in one go. */
function Batch() {
  const { data } = useAppState();
  const router = useRouter();
  const params = useSearchParams();
  const range: Range = params.get("from") && params.get("to") ? { from: params.get("from")!, to: params.get("to")! } : defaultRange(7);
  const days = Math.round((parseYmd(range.to).getTime() - parseYmd(range.from).getTime()) / 864e5) + 1;
  const today = ymd(new Date());
  const preset = range.from === today && days === 7 ? 7 : range.from === today && days === 14 ? 14 : null;
  const setRange = (r: Range) => router.replace(`/batch?${rangeQuery(r)}`, { scroll: false });

  const seq = useMemo(() => (data ? sequence(data.posts, range) : []), [data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;

  const done = seq.filter((x) => isDone(x.post.variants[x.k].status)).length;
  const first = seq.find((x) => !isDone(x.post.variants[x.k].status));
  const posts = [...new Map(seq.map((x) => [x.post.id, x.post])).values()];
  const byDay = new Map<string, Post[]>();
  for (const p of posts) byDay.set(p.date!, [...(byDay.get(p.date!) || []), p]);

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Batch" sub="Every post in the range, in slot order. Schedule them all in Instagram, marking each as you go." />
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
        </div>

        <div className="card p-4 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[18px] font-bold tabular-nums">{done} of {seq.length} scheduled</div>
            <div className="text-[12px] muted">{(() => { const r = posts.filter((p) => p.kind === "reel").length, n = posts.length - r; return `${n} post${n === 1 ? "" : "s"}${r ? `, ${r} reel${r === 1 ? "" : "s"}` : ""} × 3 accounts`; })()}</div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--soft)" }}>
            <div className="h-full rounded-full" style={{ width: `${seq.length ? (done / seq.length) * 100 : 0}%`, background: "var(--s-posted)" }} />
          </div>
          {params.get("done") && !first && seq.length > 0 && <div className="text-[14px] font-semibold" style={{ color: "var(--s-posted)" }}>All done for this range.</div>}
          {first && (
            <Link href={`/go/${first.post.id}/${first.k}?${rangeQuery(range)}`} className="btn primary !min-h-[48px] !text-[15px] !rounded-xl">
              {done ? "Continue" : "Start"}: {first.post.title || "Untitled"} · {LANGS.find((l) => l.k === first.k)!.code} <Icon name="right" size={16} />
            </Link>
          )}
        </div>

        {!posts.length && <div className="muted text-center py-10">Nothing planned in this range.</div>}
        {[...byDay.entries()].map(([d, list]) => (
          <section key={d} className="flex flex-col gap-2">
            <h2 className="font-bold text-[14px] pt-2">{fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}{d === today && <span className="muted font-medium"> · today</span>}</h2>
            {list.map((p) => {
              return (
                <article key={p.id} className="card overflow-hidden">
                  <header className="flex items-center gap-3 p-2.5 pr-3">
                    <PreviewThumb post={p} lang={"it"} className="w-10" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold break-words md:truncate">{p.title || "Untitled"}</div>
                      <div className="text-[12px] muted">{p.kind === "reel" ? <ReelBadge /> : slotName(p.slot)}</div>
                    </div>
                    <Link href={`/posts/${p.id}`} className="btn small ghost">Edit</Link>
                  </header>
                  <ul className="border-t" style={{ borderColor: "var(--line)" }}>
                    {POST_ORDER.map((k) => {
                      const l = LANGS.find((x) => x.k === k)!;
                      return (
                        <li key={k}>
                          <Link href={`/go/${p.id}/${k}?${rangeQuery(range)}`} className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0 hover:bg-[var(--soft)] active:bg-[var(--soft)]" style={{ borderColor: "var(--line)" }}>
                            <b className="w-7 text-[13px]">{l.code}</b>
                            <span className="flex-1 min-w-0 text-[13px]">{slotTimeLabel(data.settings, k, p)}</span>
                            <StatusPill s={statusOf(p, k, data.settings)} />
                            <Icon name="right" size={16} className="muted" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}


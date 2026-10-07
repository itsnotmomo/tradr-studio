"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { firstSlide } from "@/components/post-card";
import { PageHeader, Spinner, n } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client/api";
import { refreshState, useAppState } from "@/lib/client/state";
import { LANGS, LK } from "@/lib/langs";
import { addDays, ymd } from "@/lib/time";
import type { Lang, Metrics, Post } from "@/lib/types";

type SortKey = "date" | "reach" | "likes" | "saved" | "comments";
const METRICS: [keyof Metrics, string][] = [["likes", "Likes"], ["comments", "Comments"], ["reach", "Reach"], ["saved", "Saves"]];

export default function PostedPage() {
  const { data } = useAppState();
  const { data: followers, mutate: refetchFollowers } = useSWR<Record<Lang, Record<string, number>>>("/api/followers", fetcher);
  const toast = useToast();
  const [filter, setFilter] = useState<Lang | "all">("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [busy, setBusy] = useState(false);

  const posted = useMemo(() => {
    const ks = filter === "all" ? LK : [filter];
    const list = (data?.posts || []).filter((p) => ks.some((k) => p.variants[k].status === "posted"));
    const val = (p: Post) => {
      if (sort === "date") return Math.max(...ks.map((k) => p.variants[k].publishedAt || (p.date ? Date.parse(p.date) : 0)));
      return ks.reduce((s, k) => s + ((p.variants[k].metrics?.[sort] as number | null) || 0), 0);
    };
    return list.sort((a, b) => val(b) - val(a));
  }, [data?.posts, filter, sort]);

  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;
  const ks = filter === "all" ? LK : [filter];

  const refresh = async () => {
    setBusy(true);
    try {
      await api("/api/meta/refresh", { method: "POST" });
      await Promise.all([refetchFollowers(), refreshState()]);
      toast("Follower counts updated.");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const delta = (k: Lang, days: number) => {
    const h = followers?.[k];
    const now = data.meta.accounts[k]?.followers;
    if (!h || now == null) return null;
    const target = ymd(addDays(new Date(), -days));
    const older = Object.keys(h).filter((d) => d <= target).sort().pop();
    return older ? now - h[older] : null;
  };
  const fmtDelta = (d: number | null) => (d == null ? "–" : `${d > 0 ? "+" : ""}${d.toLocaleString("en-US")}`);

  return (
    <div>
      <PageHeader title="Posted" sub="Everything marked Posted. Likes, reach and saves appear here once the Meta connection is set up.">
        <button className="btn" onClick={refresh} disabled={busy}>{busy ? <Spinner /> : <Icon name="refresh" size={15} />} Refresh followers</button>
      </PageHeader>
      <div className="px-4 md:px-6 grid sm:grid-cols-3 gap-3">
        {LANGS.map((l) => {
          const a = data.meta.accounts[l.k];
          return (
            <div key={l.k} className="card p-3.5 flex items-center gap-3">
              {a?.pictureUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.pictureUrl} alt="" className="w-10 h-10 rounded-full flex-none" />
                : <div className="w-10 h-10 rounded-full flex-none" style={{ background: "var(--soft)" }} />}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] muted truncate">{l.handle}</div>
                <div className="text-[20px] font-bold tabular-nums leading-tight">{a ? n(a.followers) : <span className="text-[13px] font-medium muted">Not connected</span>}</div>
              </div>
              {a && (
                <div className="text-right text-[11.5px] tabular-nums">
                  <div><span className="muted">7d </span><b>{fmtDelta(delta(l.k, 7))}</b></div>
                  <div><span className="muted">30d </span><b>{fmtDelta(delta(l.k, 30))}</b></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 md:px-6 pt-5 pb-2 flex flex-wrap gap-2 items-center">
        <div className="seg" role="group" aria-label="Account">
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          {LANGS.map((l) => <button key={l.k} aria-pressed={filter === l.k} onClick={() => setFilter(l.k)}>{l.code}</button>)}
        </div>
        <select className="field !w-auto !bg-[var(--panel)]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="date">Newest first</option>
          <option value="reach">Most reach</option>
          <option value="likes">Most likes</option>
          <option value="saved">Most saves</option>
          <option value="comments">Most comments</option>
        </select>
      </div>

      <div className="px-4 md:px-6 pb-10 flex flex-col gap-2.5">
        {posted.map((p) => {
          const s = firstSlide(p, filter === "all" ? "en" : filter);
          return (
            <Link key={p.id} href={`/posts/${p.id}`} className="card p-2.5 md:p-3 flex flex-col md:flex-row gap-3 hover:border-[var(--line-2)]">
              <div className="flex gap-3 md:w-[240px] flex-none min-w-0">
                <div className="thumb w-12 aspect-[4/5] rounded-md flex-none" style={s ? { backgroundImage: `url("${s.url}")` } : undefined} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.title || "Untitled"}</div>
                  <div className="text-[12px] muted">{p.date && new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
              </div>
              <div className="grid gap-2 flex-1" style={{ gridTemplateColumns: `repeat(${ks.length}, minmax(0, 1fr))` }}>
                {ks.map((k) => {
                  const v = p.variants[k];
                  return (
                    <div key={k} className="rounded-lg px-2.5 py-2" style={{ background: "var(--soft)" }}>
                      <div className="text-[11px] font-bold muted mb-1">{LANGS.find((l) => l.k === k)!.code}</div>
                      {v.status === "posted" ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-0.5 text-[12px]">
                          {METRICS.map(([m, label]) => (
                            <div key={m}><b className="tabular-nums text-[13px]">{n(v.metrics?.[m] as number | null)}</b> <span className="muted">{label}</span></div>
                          ))}
                        </div>
                      ) : <div className="text-[12px] muted">Not posted</div>}
                    </div>
                  );
                })}
              </div>
            </Link>
          );
        })}
        {!posted.length && <div className="muted text-center py-10">Nothing posted yet.</div>}
      </div>
    </div>
  );
}

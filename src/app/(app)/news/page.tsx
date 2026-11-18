"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Spinner } from "@/components/ui";
import { Markdown } from "@/components/md";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { copyText } from "@/components/publish";
import { api, fetcher } from "@/lib/client/api";
import { imageFiles, toJpeg, uploadBlob } from "@/lib/client/upload";
import { IG_MAX_LEAD_MS, endSlideOf, NEWS_STATUS_LABEL, type NewsDesk, type NewsDraft, type NewsSlide, type NewsStatus, type NewsSuggestion } from "@/lib/news";
import { guessTradrNewsCategory, TRADR_NEWS_CATEGORIES, type TradrNewsChoice } from "@/lib/news";
import { relTime } from "@/lib/time";

const KEY = "/api/news";
type Data = { drafts: NewsDraft[]; suggestions: NewsSuggestion[]; desk: NewsDesk & { rev: number }; now: number };
type Tab = "review" | "approved" | "posted" | "style";
const TABS: [Tab, string][] = [["review", "To review"], ["approved", "Approved"], ["posted", "Posted"], ["style", "Style"]];
const inTab = (d: NewsDraft, t: Tab) =>
  t === "review" ? d.status === "draft" || d.status === "changes" : t === "approved" ? d.status === "approved" : t === "posted" ? d.status === "posted" || d.status === "rejected" : false;

export default function NewsPage() {
  return <Suspense><NewsView /></Suspense>;
}

function NewsView() {
  const { data, error, mutate } = useSWR<Data>(KEY, fetcher, {
    // Faster while the poster on the Mac is working on something.
    refreshInterval: (d?: Data) => (d?.drafts.some((x) => x.post && (x.post.state === "queued" || x.post.state === "running")) ? 5_000 : 30_000),
  });
  const params = useSearchParams();
  const router = useRouter();
  const only = params.get("id");
  const tab = (params.get("tab") as Tab) || "review";
  const setTab = (t: Tab) => router.replace(t === "review" ? "/news" : `/news?tab=${t}`, { scroll: false });
  const toast = useToast();

  const act = async (d: NewsDraft, action: string, note?: string, extra?: Record<string, unknown>) => {
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

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { review: 0, approved: 0, posted: 0, style: 0 };
    for (const d of data?.drafts ?? []) for (const [t] of TABS) if (inTab(d, t)) c[t]++;
    return c;
  }, [data]);

  const end = data ? endSlideOf(data.desk) : null;
  // ?id=<draftId> opens one post on its own (the direct link to a draft), whatever its tab.
  const list = (data?.drafts ?? []).filter((d) => (only ? d.id === only : inTab(d, tab)));

  return (
    <div className="news mx-auto w-full max-w-[860px] px-4 md:px-6 pt-5 md:pt-10 pb-10">
      <header className="flex items-end gap-3 pb-1">
        <div className="flex-1 min-w-0">
          <h1 className="serif text-[30px] md:text-[34px] leading-tight">News</h1>
          <p className="text-[13px] muted mt-0.5 truncate">
            {data?.desk.lastRunAt ? <>Last run {relTime(data.desk.lastRunAt, data.now)}{data.desk.lastRunSummary ? ` · ${data.desk.lastRunSummary}` : ""}</> : "Drafts for @tradr__app and @tradr_app"}
          </p>
        </div>
      </header>

      <Suggest data={data} onAdded={() => mutate()} />

      <nav className="news-tabs scroll-x" aria-label="News">
        {TABS.map(([t, label]) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {label}{t !== "style" && counts[t] > 0 && <span>{counts[t]}</span>}
            {t === "style" && data && data.desk.refs.some((r) => !data.desk.guideRefIds.includes(r.id)) && <i className="news-dot" />}
          </button>
        ))}
      </nav>

      {error && <p className="text-[13px] text-[var(--danger)] py-6">{error.message}</p>}
      {!data && !error && <div className="py-16 flex justify-center muted"><Spinner size={20} /></div>}

      {only && <p className="text-[13px] py-3"><button className="underline underline-offset-2" onClick={() => router.replace("/news", { scroll: false })}>← All posts</button></p>}

      {data && !only && tab === "style" && <StylePanel desk={data.desk} onChange={() => mutate()} />}

      {data && (only || tab !== "style") && (
        list.length === 0 ? (
          <div className="news-empty">
            {only ? "This post no longer exists." : tab === "review" ? <>Nothing to review. Run <b>make news posts</b> in Claude Code.</> : tab === "approved" ? "Nothing approved and waiting to be posted." : "Nothing posted yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-1">
            {list.map((d) => <DraftCard key={d.id} d={d} end={end?.url ?? null} now={data.now} act={act} remove={remove} />)}
          </div>
        )
      )}
    </div>
  );
}

// ---------- Suggest a story ----------

function Suggest({ data, onAdded }: { data?: Data; onAdded: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const queued = (data?.suggestions ?? []).filter((s) => s.status === "queued");
  const recent = (data?.suggestions ?? []).filter((s) => s.status !== "queued" && data && data.now - s.updatedAt < 3 * 864e5);
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`${KEY}/suggest`, { body: { text } });
      setText("");
      toast("Queued. The next run makes it first.", { ms: 2500 });
      onAdded();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const del = async (id: string) => {
    await api(`${KEY}/suggest?id=${id}`, { method: "DELETE" }).catch(() => {});
    onAdded();
  };
  return (
    <section className="news-suggest">
      <div className="flex gap-2 items-end">
        <textarea className="news-input" rows={1} placeholder="Suggest a story: link or a line"
          value={text} onChange={(e) => setText(e.target.value)}
          onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }} />
        <button className="btn primary" disabled={!text.trim() || busy} onClick={add}>{busy ? <Spinner /> : "Queue"}</button>
      </div>
      {(queued.length > 0 || recent.length > 0) && (
        <button className="news-link mt-2" onClick={() => setOpen((o) => !o)}>
          {queued.length ? `${queued.length} queued for the next run` : "Recent suggestions"} {open ? "▴" : "▾"}
        </button>
      )}
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {[...queued, ...recent].map((s) => (
            <li key={s.id} className="news-sug">
              <span className={`news-sug-dot ${s.status}`} />
              <span className="flex-1 min-w-0 break-words">
                {s.text}
                {s.status === "skipped" && s.note && <span className="block muted text-[12px] mt-0.5">Skipped: {s.note}</span>}
                {s.status === "done" && <span className="block muted text-[12px] mt-0.5">Drafted</span>}
              </span>
              {s.status === "queued" && <button className="icon-btn" aria-label="Remove" onClick={() => del(s.id)}><Icon name="x" size={15} /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Draft card ----------

const STATUS_TONE: Record<NewsStatus, string> = {
  draft: "var(--s-draft)", changes: "var(--s-ready)", approved: "var(--s-scheduled)", rejected: "var(--s-failed)", posted: "var(--s-posted)",
};

function DraftCard({ d, end, now, act, remove }: {
  d: NewsDraft; end: string | null; now: number;
  act: (d: NewsDraft, action: string, note?: string, extra?: Record<string, unknown>) => Promise<boolean>; remove: (d: NewsDraft) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const slides: (NewsSlide & { fixed?: boolean })[] = [...d.slides, ...(end ? [{ url: end, kind: "image" as const, w: 1080, h: 1350, fixed: true }] : [])];
  const run = async (action: string, n?: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    const ok = await act(d, action, n, extra);
    setBusy(null);
    return ok;
  };
  const copy = async (what: string, text: string) => toast((await copyText(text)) ? `${what} copied.` : "Copy failed.", { ms: 1800 });

  return (
    <article className="news-card">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <span className="news-tag">{d.tag}</span>
        <h2 className="flex-1 min-w-0 truncate text-[15px] font-semibold">{d.title}</h2>
        {d.collab && <span className="news-collab">Collab</span>}
        <span className="news-status" style={{ "--s": STATUS_TONE[d.status] } as React.CSSProperties}>{NEWS_STATUS_LABEL[d.status]}</span>
      </div>
      {d.collab && (
        <div className="news-collab-note">Today’s collab post: when you post it on Instagram, add <b>@{d.collab.handle}</b> as collaborator.</div>
      )}

      <Slides slides={slides} />

      <div className="px-4 pt-3 pb-4 flex flex-col gap-4">
        {d.status === "changes" && (
          <div className="news-note"><b>Changes asked.</b> The next run redoes it: “{d.changeNote}”</div>
        )}

        <TextBlock label="Instagram caption" text={d.caption} onCopy={() => copy("Caption", d.caption)} clamp />
        <TextBlock label={`X post · ${d.x.length}/280`} text={d.x} onCopy={() => copy("X text", d.x)} />

        {(d.confirmed.length > 0 || d.reported.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.confirmed.length > 0 && <Facts label="Confirmed" tone="var(--s-posted)" items={d.confirmed} />}
            {d.reported.length > 0 && <Facts label="Reported, not confirmed" tone="var(--s-ready)" items={d.reported} />}
          </div>
        )}

        <div>
          <div className="news-label">Sources</div>
          <ul className="flex flex-col gap-1">
            {d.sources.map((s) => (
              <li key={s.url} className="min-w-0"><a href={s.url} target="_blank" rel="noreferrer" className="news-src"><Icon name="ext" size={13} /> <span className="truncate">{s.label}</span></a></li>
            ))}
          </ul>
          <div className="news-label mt-3">Photos</div>
          <ul className="flex flex-col gap-1 text-[12.5px] muted">
            {d.photos.map((p, i) => (
              <li key={i} className="break-words">
                <span className="text-[var(--ink)]">{p.what}:</span> {p.credit}{p.license ? ` · ${p.license}` : ""}{" "}
                <a href={p.page || p.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a>
              </li>
            ))}
          </ul>
        </div>

        {d.post && <PostStatus d={d} now={now} />}
        {d.tradrNews && !newsOpen && <TradrNewsStatus d={d} now={now} />}
        {newsOpen && !picking && (
          <TradrNewsPanel d={d} busy={busy} onClose={() => setNewsOpen(false)}
            onPublish={async (news) => { if (await run("tradr-news", undefined, { news })) { setNewsOpen(false); toast("On Tradr News.", { ms: 2200 }); } }}
            onRemove={async () => { if (await run("tradr-news-remove")) { setNewsOpen(false); toast("Removed from Tradr News.", { ms: 2200 }); } }} />
        )}

        {picking ? (
          <PostWhen d={d} busy={busy === "post"} onCancel={() => setPicking(false)}
            onPost={async (igAt, label, news) => {
              if (await run("post", undefined, { ...(igAt == null ? {} : { igAt }), ...(news ? { news } : {}) })) {
                setPicking(false);
                toast(`Sent to the poster. Instagram goes live ${label}; ${d.post?.tweetUrl ? "the tweet already went out, so it isn't sent again" : "the tweet goes out now"}${news ? "; Tradr News goes up now" : ""}.`, { ms: 4000 });
              }
            }} />
        ) : asking ? (
          <div className="flex flex-col gap-2">
            <textarea className="news-input" rows={3} autoFocus placeholder="What should change? e.g. headline shorter, use a different photo"
              value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn primary" disabled={!note.trim() || !!busy}
                onClick={async () => { if (await run("changes", note)) { setAsking(false); setNote(""); toast("Saved. The next run redoes it.", { ms: 2500 }); } }}>
                {busy === "changes" ? <Spinner /> : "Send note"}
              </button>
              <button className="btn ghost" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="news-actions">
            <button className="btn primary" disabled={!!busy || inFlight(d)}
              onClick={() => setPicking(true)}>
              {busy === "post" ? <Spinner /> : inFlight(d) ? "Posting…" : d.post?.state === "failed" ? "Try posting again" : "Post"}
            </button>
            {d.post?.state === "queued" && <button className="btn ghost" disabled={!!busy} onClick={() => run("post-cancel")}>Cancel post</button>}
            <button className="btn" disabled={!!busy} onClick={() => setNewsOpen((v) => !v)} aria-expanded={newsOpen}>
              {d.tradrNews?.state === "published" ? "Tradr News ✓" : "Tradr News"}
            </button>
            {(d.status === "draft" || d.status === "changes") && <>
              <button className="btn" disabled={!!busy} onClick={() => run("approve")}>{busy === "approve" ? <Spinner /> : "Approve"}</button>
              <button className="btn" disabled={!!busy} onClick={() => setAsking(true)}>{d.status === "changes" ? "Edit note" : "Ask for changes"}</button>
              {d.status === "changes" && <button className="btn ghost" disabled={!!busy} onClick={() => run("reopen")}>Cancel request</button>}
              <button className="btn ghost danger" disabled={!!busy} onClick={() => run("reject")}>Reject</button>
            </>}
            {d.status === "approved" && (!d.post || d.post.state === "failed") && <PostKit d={d} slides={slides} busy={!!busy} onPosted={() => run("posted")} onBack={() => run("reopen")} copy={copy} />}
            {d.status === "posted" && <>
              <span className="text-[13px] muted">Posted {d.postedAt ? relTime(d.postedAt, now) : ""}</span>
              <button className="btn ghost" onClick={() => run("unpost")}>Undo</button>
            </>}
            {d.status === "rejected" && <>
              <button className="btn" onClick={() => run("reopen")}>Back to review</button>
              <button className="btn ghost danger" onClick={() => remove(d)}>Delete</button>
            </>}
          </div>
        )}
        <div className="text-[11.5px] faint">Drafted {relTime(d.createdAt, now)}{d.version > 1 ? ` · version ${d.version}` : ""}</div>
      </div>
    </article>
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

type WhenKey = "30m" | "1h" | "3h" | "tonight" | "tomorrow" | "24h" | "custom";

/** The choices, worked out from "now". Tonight = 21:00 Rome (15:00 New York), shown while it's at least 30 minutes away;
 *  tomorrow = 18:00 Rome (noon New York), inside Polymarket's posting window (playbook §2). */
function whenChoices(now: number): { key: WhenKey; label: string; at: number }[] {
  const r = romeParts(now);
  const tonight = romeTime(r.y, r.mo, r.d, 21, 0);
  const tmr = romeParts(now + 24 * HOUR);
  const out: { key: WhenKey; label: string; at: number }[] = [
    { key: "30m", label: "In 30 minutes", at: ceil5(now + 30 * MIN) },
    { key: "1h", label: "In 1 hour", at: ceil5(now + HOUR) },
    { key: "3h", label: "In 3 hours", at: ceil5(now + 3 * HOUR) },
  ];
  if (tonight - now >= EARLIEST) out.push({ key: "tonight", label: `Tonight ${HM.format(tonight)}`, at: tonight });
  out.push({ key: "tomorrow", label: `Tomorrow ${HM.format(romeTime(tmr.y, tmr.mo, tmr.d, 18, 0))}`, at: romeTime(tmr.y, tmr.mo, tmr.d, 18, 0) });
  out.push({ key: "24h", label: "In 24 hours", at: ceil5(now + 24 * HOUR) });
  return out;
}

/** Opens on Post: pick when Instagram goes live (default 24 h), then Post. The tweet goes out at once, unless it already went out. */
function PostWhen({ d, busy, onPost, onCancel }: {
  d: NewsDraft; busy: boolean; onPost: (igAt: number | null, label: string, news: TradrNewsChoice | null) => void; onCancel: () => void;
}) {
  // Publish to Tradr News with the post: on by default the first time; an article already up is left as is.
  const [toNews, setToNews] = useState(d.tradrNews?.state !== "published");
  const [news, setNews] = useState<TradrNewsChoice>(() => defaultNewsChoice(d));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20_000); return () => clearInterval(t); }, []);
  const [key, setKey] = useState<WhenKey>("24h");
  const [custom, setCustom] = useState(() => toLocalInput(ceil5(Date.now() + 2 * HOUR)));
  const already = d.post?.state === "failed" && d.post.igScheduledAt ? d.post : null; // a retry: Instagram is done
  const tweeted = !!d.post?.tweetUrl; // posting again never sends the tweet twice
  const choices = whenChoices(now);
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
      <div className="tn-switch-row">
        <label className="tn-switch">
          <input type="checkbox" checked={toNews} onChange={(e) => setToNews(e.target.checked)} />
          <span className="tn-track" aria-hidden><span /></span>
          <span className="font-semibold text-[13.5px]">{d.tradrNews?.state === "published" ? "Update on Tradr News" : "Publish to Tradr News"}</span>
        </label>
        {toNews && <TradrNewsFields value={news} onChange={setNews} />}
      </div>
      <div className="news-actions">
        <button className="btn primary" disabled={busy || !!problem}
          onClick={() => {
            // Relative choices are worked out again at the moment of the tap.
            const t = Date.now();
            const fresh = key === "custom" ? parseCustom() : whenChoices(t).find((c) => c.key === key)?.at ?? at;
            onPost(already ? null : fresh, `${WHEN_FMT.format(already ? already.igAt : fresh)} Rome`, toNews ? news : null);
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

function Slides({ slides }: { slides: (NewsSlide & { fixed?: boolean })[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="news-strip scroll-x">
        {slides.map((s, i) => (
          <button key={s.url} className="news-slide" onClick={() => setOpen(i)} aria-label={`Slide ${i + 1}`}>
            {s.kind === "video"
              ? <><img src={s.poster || ""} alt="" loading="lazy" /><span className="news-play">▶</span></>
              : <img src={s.url} alt="" loading="lazy" />}
            <span className="news-n">{i + 1}{s.fixed ? " · fixed" : ""}</span>
          </button>
        ))}
      </div>
      {open !== null && <Lightbox slides={slides} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ slides, start, onClose }: { slides: NewsSlide[]; start: number; onClose: () => void }) {
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
      <div className="news-lb-frame">
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

function TextBlock({ label, text, onCopy, clamp }: { label: string; text: string; onCopy: () => void; clamp?: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="news-label flex-1 mb-0">{label}</div>
        <button className="btn sm" onClick={onCopy}><Icon name="copy" size={14} /> Copy</button>
      </div>
      <p className={`news-text ${clamp && !more ? "clamped" : ""}`} onClick={() => setMore(true)}>{text}</p>
    </div>
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

// ---------- Posting kit: one tap to save every slide, one tap per text ----------

function PostKit({ d, slides, busy, onPosted, onBack, copy }: {
  d: NewsDraft; slides: NewsSlide[]; busy: boolean; onPosted: () => void; onBack: () => void; copy: (what: string, text: string) => void;
}) {
  const toast = useToast();
  const [files, setFiles] = useState<File[] | null>(null);
  const [saving, setSaving] = useState(false);
  const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "post";

  // Fetched ahead of the tap: iOS only opens the share sheet straight from a tap.
  useEffect(() => {
    let live = true;
    Promise.all(slides.map(async (s, i) => {
      const r = await fetch(s.url);
      const b = await r.blob();
      const ext = s.kind === "video" ? "mp4" : "jpg";
      return new File([b], `tradr-${slug}-${i + 1}.${ext}`, { type: s.kind === "video" ? "video/mp4" : "image/jpeg" });
    })).then((f) => live && setFiles(f), () => live && setFiles([]));
    return () => { live = false; };
  }, [slides, slug]);

  const save = async () => {
    if (!files?.length) return;
    setSaving(true);
    try {
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files });
      } else {
        for (const f of files) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          await new Promise((r) => setTimeout(r, 350));
        }
        toast(`${files.length} files downloaded.`, { ms: 2000 });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-3 gap-2">
        <button className="btn primary" disabled={!files?.length || saving} onClick={save}>
          {!files ? <Spinner /> : <><Icon name="download" size={15} /> Slides ({slides.length})</>}
        </button>
        <button className="btn" onClick={() => copy("Caption", d.caption)}><Icon name="copy" size={14} /> Caption</button>
        <button className="btn" onClick={() => copy("X text", d.x)}><Icon name="copy" size={14} /> X text</button>
      </div>
      <div className="flex gap-2">
        <button className="btn flex-1" disabled={busy} onClick={onPosted}>Mark posted</button>
        <button className="btn ghost" disabled={busy} onClick={onBack}>Back to review</button>
      </div>
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
        <h3 className="news-h3">Style guide</h3>
        <p className="text-[13px] muted mb-2.5">Every draft follows this.{desk.guideUpdatedAt ? ` Updated ${new Date(desk.guideUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}</p>
        <div className="news-guide">{desk.guide ? <Markdown text={desk.guide} /> : <span className="muted">Not written yet.</span>}</div>
      </section>
    </div>
  );
}


// ---------- Tradr News (18 Nov 2026) ----------

function defaultNewsChoice(d: NewsDraft): TradrNewsChoice {
  if (d.tradrNews) return { category: d.tradrNews.category, breaking: d.tradrNews.breaking };
  const spec = (d as unknown as { spec?: { slides?: { headline?: string; tag?: string }[] } }).spec;
  const hook = spec?.slides?.[0];
  return {
    category: guessTradrNewsCategory(`${d.title} ${hook?.headline ?? ""} ${d.caption.slice(0, 400)}`),
    breaking: /breaking/i.test(d.tag || "") || /breaking/i.test(hook?.tag || ""),
  };
}

/** Category chips and the Breaking toggle. */
function TradrNewsFields({ value, onChange }: { value: TradrNewsChoice; onChange: (v: TradrNewsChoice) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="news-when-opts" role="radiogroup" aria-label="Tradr News category">
        {TRADR_NEWS_CATEGORIES.map((c) => (
          <button key={c.id} role="radio" aria-checked={value.category === c.id} onClick={() => onChange({ ...value, category: c.id })}>{c.label}</button>
        ))}
      </div>
      <label className="tn-switch">
        <input type="checkbox" checked={value.breaking} onChange={(e) => onChange({ ...value, breaking: e.target.checked })} />
        <span className="tn-track" aria-hidden><span /></span>
        <span className="text-[13px]">Breaking <span className="muted">· shows the red Breaking mark and alerts everyone following Breaking</span></span>
      </label>
    </div>
  );
}

/** Publish this draft to Tradr News on its own (no Instagram, no X), update it, or take it down. */
function TradrNewsPanel({ d, busy, onPublish, onRemove, onClose }: {
  d: NewsDraft; busy: string | null; onPublish: (n: TradrNewsChoice) => void; onRemove: () => void; onClose: () => void;
}) {
  const [news, setNews] = useState<TradrNewsChoice>(() => defaultNewsChoice(d));
  const live = d.tradrNews?.state === "published";
  return (
    <div className="news-when">
      <div className="news-label">Tradr News only</div>
      <p className="text-[13px] muted">
        {live ? <>It&apos;s on Tradr News. Publishing again updates the article (same link); comments and likes stay.</>
          : <>Posts this carousel as an article on Tradr News: headline, slides, the slide text and the caption. Instagram and X aren&apos;t touched. Followers of the category get an alert the first time.</>}
      </p>
      <TradrNewsFields value={news} onChange={setNews} />
      <div className="news-actions">
        <button className="btn primary" disabled={!!busy} onClick={() => onPublish(news)}>
          {busy === "tradr-news" ? <Spinner /> : live ? "Update on Tradr News" : "Publish to Tradr News"}
        </button>
        {live && <button className="btn ghost danger" disabled={!!busy} onClick={onRemove}>{busy === "tradr-news-remove" ? <Spinner /> : "Remove"}</button>}
        <button className="btn ghost" disabled={!!busy} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function TradrNewsStatus({ d, now }: { d: NewsDraft; now: number }) {
  const n = d.tradrNews!;
  const cat = TRADR_NEWS_CATEGORIES.find((c) => c.id === n.category)?.label ?? n.category;
  return (
    <div className="news-note text-[13px]">
      {n.state === "published" && <><b>On Tradr News</b> · {cat}{n.breaking ? " · Breaking" : ""} · {n.url ? <a href={n.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">open the article</a> : null}{n.error ? <span className="text-[var(--danger)]"> · last update failed: {n.error}</span> : null}</>}
      {n.state === "hidden" && <><b>Removed from Tradr News</b> {relTime(n.updatedAt, now)}{n.error ? <span className="text-[var(--danger)]"> · {n.error}</span> : null}</>}
      {n.state === "failed" && <><b className="text-[var(--danger)]">Tradr News failed:</b> {n.error}</>}
    </div>
  );
}

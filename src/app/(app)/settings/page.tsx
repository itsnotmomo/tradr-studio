"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorBox, PageHeader, Spinner, Warn, n } from "@/components/ui";
import { ConfirmButton } from "@/components/publish";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client/api";
import { refreshState, useAppState, type AppState } from "@/lib/client/state";
import { uploadSlide } from "@/lib/client/upload";
import { hashtagCount } from "@/lib/caption";
import { HASHTAG_MAX, RATIO_MAX, RATIO_MIN } from "@/lib/rules";
import { LANGS } from "@/lib/langs";
import { ALL_SLOTS } from "@/lib/slots";
import { relTime } from "@/lib/time";
import type { Lang } from "@/lib/types";

export default function SettingsPage() {
  return <Suspense><Settings_ /></Suspense>;
}

async function patchSettings(body: unknown) {
  const r = await api<{ updated: number }>("/api/settings", { method: "PATCH", body });
  await refreshState();
  return r;
}

function Settings_() {
  const { data } = useAppState();
  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;
  return (
    <div className="max-w-[1200px] pb-16">
      <PageHeader title="Settings" />
      <div className="px-4 md:px-6 flex flex-col gap-6">
        <Accounts data={data} />
        <section>
          <h2 className="font-bold text-[15px] mb-1">Per account</h2>
          <p className="text-[13px] muted mb-3">The Tradr slide is added as the last slide of every post. The caption parts below prefill every new post, and stay editable per post.</p>
          <div className="grid md:grid-cols-3 gap-3">{LANGS.map((l) => <LangColumn key={l.k} k={l.k} data={data} />)}</div>
        </section>
        <General data={data} />
        <Notifications data={data} />
        <Scheduler data={data} />
        <Security />
      </div>
    </div>
  );
}

function Accounts({ data }: { data: AppState }) {
  const params = useSearchParams();
  const toast = useToast();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = params.get("meta_ok");
  const err = params.get("meta_error");
  const m = data.meta;

  const pasteToken = async () => {
    setBusy(true);
    try {
      const r = await api<{ connected: Lang[] }>("/api/meta/token", { body: { token } });
      setToken("");
      await refreshState();
      toast(`Connected ${r.connected.map((k) => LANGS.find((l) => l.k === k)!.handle).join(", ")}.`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async (lang?: Lang) => {
    await api("/api/meta/disconnect", { body: { lang } });
    await refreshState();
  };

  return (
    <section id="accounts" className="card p-4 flex flex-col gap-3 scroll-mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-[15px] flex-1">Instagram accounts <span className="muted font-medium text-[13px]">· for stats</span></h2>
        {m.configured && <a className="btn primary" href="/api/meta/connect">{Object.keys(m.accounts).length ? "Reconnect with Facebook" : "Connect with Facebook"}</a>}
      </div>
      {ok && <div className="text-[13px]" style={{ color: "var(--s-posted)" }}>Connected {ok.split(",").map((k) => LANGS.find((l) => l.k === k)?.handle).join(", ")}.</div>}
      {err && <ErrorBox title="Couldn’t connect">{err}</ErrorBox>}
      {!m.configured && (
        <Warn>You post from the Instagram app, so the Meta connection is only for the numbers on the Posted page. It’s not set up yet. Once META_APP_ID and META_APP_SECRET are set, a “Connect with Facebook” button appears here.</Warn>
      )}
      <div className="grid md:grid-cols-3 gap-2">
        {LANGS.map((l) => {
          const a = m.accounts[l.k];
          return (
            <div key={l.k} className="rounded-xl border p-3 flex items-center gap-3" style={{ borderColor: a?.lastError ? "var(--danger-line)" : "var(--line)", background: a?.lastError ? "var(--danger-bg)" : "var(--soft)" }}>
              {a?.pictureUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.pictureUrl} alt="" className="w-9 h-9 rounded-full flex-none" />
                : <div className="w-9 h-9 rounded-full flex-none border" style={{ borderColor: "var(--line)" }} />}
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="font-semibold">{l.handle} <span className="muted font-normal">· {l.name}</span></div>
                {a ? (
                  <div className="text-[12px]">
                    {a.lastError ? <span style={{ color: "var(--danger)" }}>{a.lastError}</span> : <span style={{ color: "var(--s-posted)" }}>Connected</span>}
                    <span className="muted"> · {n(a.followers)} followers{a.tokenExpiresAt ? ` · token expires ${relTime(a.tokenExpiresAt)}` : ""}</span>
                  </div>
                ) : <div className="text-[12px] muted">Not connected</div>}
              </div>
              {a && <ConfirmButton className="btn small ghost" confirm="Disconnect?" onConfirm={() => disconnect(l.k)}>×</ConfirmButton>}
            </div>
          );
        })}
      </div>
      {m.unmatched.length > 0 && <div className="text-[12px] muted">Also visible but not used: {m.unmatched.map((u) => "@" + u.username).join(", ")}.</div>}
      {m.configured && (
        <details className="text-[13px]">
          <summary className="cursor-pointer muted">Use a token instead (system user or Graph API Explorer)</summary>
          <div className="flex gap-2 mt-2">
            <input className="field" type="password" placeholder="Paste access token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
            <button className="btn" onClick={pasteToken} disabled={busy || token.length < 20}>{busy ? <Spinner /> : null} Connect</button>
          </div>
        </details>
      )}
    </section>
  );
}

function LangColumn({ k, data }: { k: Lang; data: AppState }) {
  const toast = useToast();
  const l = LANGS.find((x) => x.k === k)!;
  const s = data.settings.langs[k];
  const [tradr, setTradr] = useState(s.tradr);
  const [tags, setTags] = useState(s.hashtags);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTradr(s.tradr);
    setTags(s.hashtags);
  }, [s.tradr, s.hashtags]);

  const save = async (body: Record<string, unknown>) => {
    try {
      await patchSettings({ langs: { [k]: body } });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const slide = await uploadSlide(f, "tradr");
      const r = slide.w / slide.h;
      if (r < RATIO_MIN - 0.005 || r > RATIO_MAX + 0.005) toast(`That image is ${slide.w}×${slide.h}. Instagram needs a shape between 4:5 and 1.91:1, so posts would fail.`, { tone: "error" });
      await save({ tradrSlide: slide });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    try {
      const r = await patchSettings({ langs: { [k]: { tradr, hashtags: tags } }, applyDefaultsTo: k });
      toast(`Updated ${r.updated} ${l.code} post${r.updated === 1 ? "" : "s"} that aren’t posted yet.`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const tagN = hashtagCount(tags);
  return (
    <div className="card p-3.5 flex flex-col gap-3">
      <div>
        <h3 className="font-bold">{l.name}</h3>
        <div className="text-[12px] muted">{l.handle}</div>
      </div>
      <div>
        <span className="label">Tradr slide (always last)</span>
        <div className="thumb aspect-[4/5] rounded-lg flex items-center justify-center text-[12px] text-[#999] text-center p-3" style={s.tradrSlide ? { backgroundImage: `url("${s.tradrSlide.url}")` } : undefined}>
          {!s.tradrSlide && "No Tradr slide yet"}
        </div>
        <label className="btn small mt-2 cursor-pointer">
          {busy ? <><Spinner /> Uploading…</> : s.tradrSlide ? "Replace" : "Upload"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </label>
        {s.tradrSlide && <span className="text-[11.5px] muted ml-2">{s.tradrSlide.w}×{s.tradrSlide.h}</span>}
      </div>
      <div>
        <label className="label" htmlFor={`t_${k}`}>Default “About Tradr”</label>
        <textarea id={`t_${k}`} className="field" rows={4} value={tradr} onChange={(e) => setTradr(e.target.value)} onBlur={() => tradr !== s.tradr && save({ tradr })} />
      </div>
      <div>
        <label className="label" htmlFor={`g_${k}`}>Default hashtags</label>
        <textarea id={`g_${k}`} className="field" rows={3} value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => tags !== s.hashtags && save({ hashtags: tags })} />
        <div className="text-[12px] mt-1" style={{ color: tagN > HASHTAG_MAX ? "var(--danger)" : "var(--muted)" }}>{tagN} / {HASHTAG_MAX} hashtags</div>
      </div>
      <ConfirmButton className="btn small" confirm="Tap again: overwrite parts 2 and 3" onConfirm={apply}>Apply to posts not posted yet</ConfirmButton>
    </div>
  );
}

const ZONE_ORDER: Lang[] = ["it", "es", "en"];

function General({ data }: { data: AppState }) {
  const toast = useToast();
  const zones = typeof Intl.supportedValuesOf === "function" ? ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")] : [data.settings.timezone];
  const local = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const save = async (body: Record<string, unknown>) => {
    try {
      const r = await api<{ rescheduled: number }>("/api/settings", { method: "PATCH", body });
      await refreshState();
      toast(r.rescheduled ? `Saved. ${r.rescheduled} scheduled version${r.rescheduled === 1 ? "" : "s"} moved to the new time.` : "Saved.", { ms: 2500 });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  return (
    <section id="slots" className="card p-4 flex flex-col gap-3 scroll-mt-4">
      <div>
        <h2 className="font-bold text-[15px]">Posting slots</h2>
        <p className="text-[12.5px] muted mt-0.5">Each day has a Morning and an Afternoon slot for posts, with an optional Reel slot in between. Each account publishes at its own local time. Daylight saving is handled per zone.</p>
      </div>
      {/* A table on desktop; one block per account on a phone. */}
      <div className="flex flex-col">
        <div className="hidden md:grid grid-cols-[170px_minmax(0,1fr)_repeat(3,110px)] gap-3 text-[12px] muted font-medium pb-1.5">
          <span>Account</span><span>Time zone</span>{ALL_SLOTS.map((c) => <span key={c.k}>{c.name}</span>)}
        </div>
        {ZONE_ORDER.map((k) => {
          const l = LANGS.find((x) => x.k === k)!;
          const sc = data.settings.schedule[k];
          return (
            <div key={k} className="border-t py-2.5 grid grid-cols-3 md:grid-cols-[170px_minmax(0,1fr)_repeat(3,110px)] gap-x-3 gap-y-2 items-center text-[13px]" style={{ borderColor: "var(--line)" }}>
              <div className="col-span-3 md:col-span-1 min-w-0 truncate"><b>{l.code}</b> <span className="muted">{l.handle}</span></div>
              <select className="field !min-h-[32px] !py-1 col-span-3 md:col-span-1 min-w-0" value={sc.zone} onChange={(e) => save({ schedule: { [k]: { zone: e.target.value } } })} aria-label={`${l.code} time zone`}>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              {ALL_SLOTS.map(({ k: slot, name }) => (
                <label key={slot} className="flex flex-col gap-0.5 min-w-0">
                  <span className="md:hidden text-[11px] muted">{name}</span>
                  <input type="time" className="field !min-h-[32px] !py-1 w-full" defaultValue={sc[slot]} aria-label={`${l.code} ${name}`}
                    onBlur={(e) => e.target.value && e.target.value !== sc[slot] && save({ schedule: { [k]: { [slot]: e.target.value } } })} />
                </label>
              ))}
            </div>
          );
        })}
      </div>
      <div className="max-w-[360px]">
        <label className="label" htmlFor="tz">Your time zone (for “today” when posting from Ideas)</label>
        <select id="tz" className="field" value={data.settings.timezone} onChange={(e) => save({ timezone: e.target.value })}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        {local && local !== data.settings.timezone && (
          <div className="text-[12px] mt-1" style={{ color: "var(--warn)" }}>
            This device is on {local}. <button className="underline" onClick={() => save({ timezone: local })}>Use it</button>
          </div>
        )}
      </div>
    </section>
  );
}

function Notifications({ data }: { data: AppState }) {
  const toast = useToast();
  const n = data.settings.notify;
  const [sending, setSending] = useState(false);
  const save = async (notify: Record<string, unknown>) => {
    try {
      await patchSettings({ notify });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const test = async () => {
    setSending(true);
    try {
      await api("/api/notify/test", { method: "POST" });
      toast("Sent. It should arrive on your phone in a few seconds.");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setSending(false);
    }
  };
  const row = (key: "weekly" | "slots" | "missed", label: string, hint: string) => (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <input type="checkbox" className="chk mt-0.5" checked={n[key]} onChange={(e) => save({ [key]: e.target.checked })} />
      <span><span className="font-semibold text-[13.5px]">{label}</span><span className="block text-[12.5px] muted">{hint}</span></span>
    </label>
  );
  return (
    <section id="notifications" className="card p-4 flex flex-col gap-1 scroll-mt-4">
      <h2 className="font-bold text-[15px]">Notifications</h2>
      <p className="text-[12.5px] muted mb-1">Sent through ntfy to your phone. Tapping one opens the right screen here.</p>
      {row("weekly", "Weekly batch", "Mondays: how many posts this week and how many aren’t scheduled yet. Opens Batch.")}
      {n.weekly && (
        <div className="flex items-center gap-2 pl-7 pb-1 text-[13px]">
          <span className="muted">Mondays at</span>
          <input type="time" className="field !w-[110px] !min-h-[32px] !py-1" defaultValue={n.weeklyTime} onBlur={(e) => e.target.value && e.target.value !== n.weeklyTime && save({ weeklyTime: e.target.value })} />
          <span className="muted">{data.settings.timezone}</span>
        </div>
      )}
      {row("slots", "Slot reminders", "One per account at its local slot time: “post it now”, or “goes live now” if it’s scheduled in Instagram.")}
      {row("missed", "Missed", "One follow-up if a slot is 2 hours past and still not scheduled or posted.")}
      <div className="pt-2"><button className="btn" onClick={test} disabled={sending}>{sending ? <Spinner /> : null} Send test notification</button></div>
    </section>
  );
}

function Scheduler({ data }: { data: AppState }) {
  const last = data.health.lastTickAt;
  const healthy = !!last && data.now - last < 5 * 60_000;
  let result: { summary?: string } = {};
  try {
    result = data.health.lastResult ? JSON.parse(data.health.lastResult) : {};
  } catch {
    /* ignore */
  }
  return (
    <section id="scheduler" className="card p-4 flex flex-col gap-2 scroll-mt-4">
      <h2 className="font-bold text-[15px]">Scheduler</h2>
      <div className="flex items-center gap-2 text-[13px]">
        <i className={`dot ${healthy ? "s-posted" : "s-failed"}`} />
        {last ? <>Last ran {relTime(last, data.now)}{result.summary ? ` · ${result.summary}` : ""}</> : "Has never run."}
      </div>
      <p className="text-[12.5px] muted">Runs every minute (cron-job.org) and sends the reminders. A separate check every 30 minutes sends one ntfy alert if it stops, and one when it’s running again.</p>
    </section>
  );
}

function Security() {
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/password", { body: { current: cur, next } });
      setCur("");
      setNext("");
      toast("Password changed. Other devices need to sign in again.");
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    }
  };
  return (
    <section className="card p-4 grid md:grid-cols-2 gap-5">
      <form onSubmit={change} className="flex flex-col gap-2">
        <h2 className="font-bold text-[15px]">Password</h2>
        <input className="field" type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <input className="field" type="password" placeholder="New password (12+ characters)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <button className="btn self-start" disabled={!cur || next.length < 12}>Change password</button>
      </form>
      <div className="flex flex-col gap-2 items-start">
        <h2 className="font-bold text-[15px]">Backup &amp; sessions</h2>
        <p className="text-[12.5px] muted">A full backup is saved automatically every night (kept 30 days). You can also download one now.</p>
        <a className="btn" href="/api/backup">Download backup</a>
        <ConfirmButton className="btn danger" confirm="Tap again to sign out everywhere" onConfirm={async () => { await api("/api/auth/signout-all", { method: "POST" }); location.href = "/login"; }}>
          Sign out on all devices
        </ConfirmButton>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ErrorBox, Spinner, Warn, n } from "./ui";
import { Icon } from "./icons";
import { useToast } from "./toast";
import { patchPost, postAction, type AppState } from "@/lib/client/state";
import { preflight } from "@/lib/preflight";
import { buildCaption } from "@/lib/caption";
import { LANGS, LK, langInfo } from "@/lib/langs";
import { publishAt, slotName, zoneLabel } from "@/lib/slots";
import { fmtDate, relTime } from "@/lib/time";
import type { Lang, Post, Settings } from "@/lib/types";

const STAGES: Record<string, string> = {
  starting: "Starting",
  "uploading-slides": "Sending slides to Instagram",
  "processing-slides": "Instagram is processing the slides",
  "creating-carousel": "Building the carousel",
  publishing: "Publishing",
};

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "10:00 Rome" and, if different, "(11:00 your time)". */
export function slotTimeLabel(s: Settings, k: Lang, post: Pick<Post, "date" | "slot">) {
  const sc = s.schedule[k];
  const local = `${sc[post.slot]} ${zoneLabel(sc.zone)}`;
  if (!post.date) return local;
  const yours = new Date(publishAt(s, k, post.date, post.slot)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return yours === sc[post.slot] ? local : `${local} (${yours} your time)`;
}

/** A button that needs a second tap within 4 s. For things that can't be undone. */
export function ConfirmButton({ children, confirm, onConfirm, className, disabled }: { children: React.ReactNode; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`${className || "btn"} ${armed ? "solid-danger" : ""}`} disabled={disabled}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirm : children}
    </button>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function PublishControls({ post, k, data, compact }: { post: Post; k: Lang; data: AppState; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const v = post.variants[k];
  const ls = data.settings.langs[k];
  const { problems, warnings } = preflight(k, v, ls, !!data.meta.accounts[k]);
  const code = langInfo(k).code;

  const run = async (action: "schedule" | "now" | "unschedule" | "retry" | "metrics") => {
    setBusy(action);
    try {
      await postAction(post.id, action, [k]);
      if (action === "schedule") toast(`${code} scheduled for ${fmtDate(post.date!, { weekday: "short", day: "numeric", month: "short" })}, ${slotTimeLabel(data.settings, k, post)}.`);
      if (action === "now" || action === "retry") toast(`${code} is publishing. This takes up to a minute.`);
    } catch (e) {
      toast(`${code}: ${(e as Error).message}`, { tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => toast((await copyText(buildCaption(v))) ? `${code} caption copied.` : "Copy failed.", { ms: 2000 });

  if (v.state === "publishing") {
    return (
      <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--s-publishing)" }} role="status">
        <Spinner /> {STAGES[v.stage || ""] || "Publishing"}…
      </div>
    );
  }

  if (v.state === "posted") {
    const m = v.metrics;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span style={{ color: "var(--s-posted)" }} className="font-semibold">Posted {v.publishedAt ? when(v.publishedAt) : ""}</span>
          {v.permalink && <a className="btn small" href={v.permalink} target="_blank" rel="noreferrer">View on Instagram <Icon name="ext" size={13} /></a>}
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {([["Likes", m?.likes], ["Comments", m?.comments], ["Reach", m?.reach], ["Saves", m?.saved]] as const).map(([label, val]) => (
            <div key={label} className="rounded-lg py-1.5" style={{ background: "var(--panel)" }}>
              <div className="font-bold text-[14px] tabular-nums">{n(val)}</div>
              <div className="text-[10.5px] muted">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11.5px] muted">
          <span className="flex-1">{m ? `Updated ${relTime(m.fetchedAt)}` : "Numbers arrive within the hour."}{v.metricsError ? ` · ${v.metricsError}` : ""}</span>
          <button className="btn small ghost" onClick={() => run("metrics")} disabled={!!busy}>{busy === "metrics" ? <Spinner /> : <Icon name="refresh" size={14} />}</button>
        </div>
      </div>
    );
  }

  if (v.state === "failed") {
    return (
      <ErrorBox title={`${code} didn't post`}
        action={<>
          <button className="btn small primary" onClick={() => run("retry")} disabled={!!busy || problems.length > 0}>{busy === "retry" ? <Spinner /> : null} Retry now</button>
          <button className="btn small" onClick={() => run("unschedule")} disabled={!!busy}>Back to draft</button>
        </>}>
        {v.error?.message}
        {v.error && <div className="mt-1 text-[11.5px] muted">{[v.error.stage && `at “${STAGES[v.error.stage] || v.error.stage}”`, v.error.detail, `${v.attempts} attempt${v.attempts === 1 ? "" : "s"}`, relTime(v.error.at)].filter(Boolean).join(" · ")}</div>}
        {problems.length > 0 && <div className="mt-1.5">Fix first: {problems.join(" ")}</div>}
      </ErrorBox>
    );
  }

  if (v.state === "scheduled") {
    const at = v.nextAttemptAt ?? v.scheduledAt!;
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[12.5px]">
          <span className="font-semibold" style={{ color: "var(--s-scheduled)" }}>{v.nextAttemptAt ? "Retrying" : "Scheduled"} {when(at)}</span>
          <span className="muted"> · {relTime(at)}</span>
        </div>
        {v.nextAttemptAt && v.error && <Warn>Last attempt failed: {v.error.message}</Warn>}
        {problems.length > 0 && <ErrorBox title="This will fail unless fixed">{problems.join("\n")}</ErrorBox>}
        <div className="flex flex-wrap gap-1.5">
          <button className="btn small" onClick={() => run("unschedule")} disabled={!!busy}>Unschedule</button>
          <ConfirmButton className="btn small" confirm="Tap again to post now" onConfirm={() => run("now")} disabled={!!busy || problems.length > 0}>Post now</ConfirmButton>
          {!compact && <button className="btn small ghost" onClick={copy}><Icon name="copy" size={14} /> Copy caption</button>}
        </div>
      </div>
    );
  }

  // draft / ready
  const toggleReady = async () => {
    try {
      await patchPost(post.id, { variants: { [k]: { ready: !v.ready } } });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {problems.length > 0 && (compact
        ? <div className="text-[12px]" style={{ color: "var(--warn)" }}>{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}</div>
        : <Warn><b>Before this can go out:</b><ul className="list-disc pl-4 mt-1">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Warn>)}
      {!compact && warnings.map((w) => <Warn key={w}>{w}</Warn>)}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="btn small cursor-pointer select-none">
          <input type="checkbox" className="chk" checked={v.ready} onChange={toggleReady} /> Ready
        </label>
        <button className="btn small primary" onClick={() => run("schedule")} disabled={!!busy || problems.length > 0 || !post.date}
          title={post.date ? undefined : "Put the post on a day first"}>
          {busy === "schedule" ? <Spinner /> : null}
          {post.date ? `Schedule ${fmtDate(post.date, { day: "numeric", month: "short" })}, ${data.settings.schedule[k][post.slot]} ${zoneLabel(data.settings.schedule[k].zone)}` : "Schedule"}
        </button>
        <ConfirmButton className="btn small" confirm="Tap again to post now" onConfirm={() => run("now")} disabled={!!busy || problems.length > 0}>
          {busy === "now" ? <Spinner /> : null} Post now
        </ConfirmButton>
        <button className="btn small ghost" onClick={copy}><Icon name="copy" size={14} />{compact ? "" : " Copy caption"}</button>
      </div>
    </div>
  );
}

/** Schedule / post all three languages at once. */
export function PublishAll({ post, data }: { post: Post; data: AppState }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = LK.filter((k) => ["idle", "failed"].includes(post.variants[k].state));
  if (!open.length) return null;
  const blocked = open.filter((k) => preflight(k, post.variants[k], data.settings.langs[k], !!data.meta.accounts[k]).problems.length);
  const go = async (action: "schedule" | "now") => {
    setBusy(true);
    try {
      await postAction(post.id, action, open);
      toast(action === "schedule" ? `Scheduled ${open.map((k) => langInfo(k).code).join(", ")}.` : `Publishing ${open.map((k) => langInfo(k).code).join(", ")}…`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const label = open.length === 3 ? "all 3" : open.map((k) => langInfo(k).code).join(" + ");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn primary" disabled={busy || !!blocked.length || !post.date} onClick={() => go("schedule")}>
        Schedule {label}{post.date ? ` · ${fmtDate(post.date, { weekday: "short", day: "numeric", month: "short" })} ${slotName(post.slot)}` : ""}
      </button>
      <ConfirmButton className="btn" confirm={`Tap again to post ${label} now`} onConfirm={() => go("now")} disabled={busy || !!blocked.length}>Post {label} now</ConfirmButton>
      {blocked.length > 0 && <span className="text-[12px]" style={{ color: "var(--warn)" }}>{blocked.map((k) => LANGS.find((l) => l.k === k)!.code).join(", ")} not ready to go out yet (see below).</span>}
      {!post.date && <span className="text-[12px] muted">Put it on a day to schedule.</span>}
    </div>
  );
}

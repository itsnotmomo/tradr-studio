import "server-only";
import { put, list, del } from "@vercel/blob";
import { hashToObject, redis } from "./redis";
import { dueVariants, getKv, listInspo, listPlans, listPosts, stuckVariants } from "./store";
import { getConnection, getSettings, mutateConnection } from "./settings";
import { metricsDue, publishVariant, recoverStuck, refreshMetrics, type PublishOutcome } from "./publisher";
import { accountProfile } from "./meta/publish";
import { debugToken } from "./meta/accounts";
import { describeGraphError } from "./meta/graph";
import { decrypt } from "./secrets";
import { LK } from "../langs";
import { utcToZoned } from "../time";
import { AUTO_PUBLISH } from "../features";
import { runNotifications } from "./notify";
import type { Lang } from "../types";

const HEARTBEAT = "sched:last";

export async function schedulerHealth() {
  const p = redis().pipeline();
  p.get(HEARTBEAT);
  p.get("sched:result");
  const [last, result] = (await p.exec()) as [string | null, string | null];
  return { lastTickAt: last ? Number(last) : null, lastResult: result };
}

/** Runs once a minute (cron-job.org) and once a day (Vercel Cron, as a backstop). */
export async function tick() {
  const now = Date.now();
  await redis().set(HEARTBEAT, String(now));
  const out: { published: PublishOutcome[]; recovered: number; metrics: number; daily: string | null; notified: string[] } = {
    published: [], recovered: 0, metrics: 0, daily: null, notified: [],
  };

  // 0. Reminders (ntfy). Never let a notification problem stop the rest of the run.
  try {
    out.notified = await runNotifications(now);
  } catch (e) {
    console.error("notifications failed", e);
  }

  if (AUTO_PUBLISH) {
    // 1. Attempts that started >10 minutes ago and never finished.
    for (const [id, k] of await stuckVariants(now - 10 * 60_000)) {
      await recoverStuck(id, k);
      out.recovered++;
    }
    // 2. Everything due now. Different accounts publish in parallel.
    const due = await dueVariants(now, 12);
    out.published = await Promise.all(due.map(([id, k]) => publishVariant(id, k)));
  }

  // 3. Numbers, every 15 minutes at most.
  if (await redis().set("job:metrics", "1", { nx: true, ex: 14 * 60 })) {
    const posts = await listPosts();
    const jobs: [string, Lang][] = [];
    for (const p of posts) for (const k of LK) if (metricsDue(p.variants[k], now)) jobs.push([p.id, k]);
    for (const [id, k] of jobs.slice(0, 30)) {
      await refreshMetrics(id, k);
      out.metrics++;
    }
  }

  // 4. Once a day: followers, token health, backup.
  const settings = await getSettings();
  const today = utcToZoned(now, settings.timezone).date;
  if (await redis().set(`job:daily:${today}`, "1", { nx: true, ex: 3 * 86400 })) {
    out.daily = await daily(today).catch((e) => `daily failed: ${(e as Error).message}`);
  }

  const summary = [...out.published.filter((x) => x.result !== "skipped").map((x) => `${x.lang}:${x.result}`), ...(out.notified.length ? [`${out.notified.length} notification${out.notified.length === 1 ? "" : "s"}`] : [])].join(" ");
  await redis().set("sched:result", JSON.stringify({ at: now, summary, recovered: out.recovered, metrics: out.metrics }));
  return out;
}

export async function snapshotFollowers(dateKey: string) {
  const conn = await getConnection();
  const errors: Partial<Record<Lang, string | null>> = {};
  const profiles: Partial<Record<Lang, Awaited<ReturnType<typeof accountProfile>>>> = {};
  for (const k of LK) {
    const a = conn.accounts[k];
    if (!a) continue;
    try {
      const prof = await accountProfile(a.igUserId, decrypt(a.tokenEnc));
      profiles[k] = prof;
      errors[k] = null;
      if (prof.followers_count != null) await redis().hset(`followers:${k}`, { [dateKey]: String(prof.followers_count) });
    } catch (e) {
      errors[k] = describeGraphError(e).message;
    }
  }
  await mutateConnection((c) => {
    for (const k of LK) {
      const a = c.accounts[k];
      if (!a || !(k in errors)) continue;
      a.lastError = errors[k] ?? null;
      const prof = profiles[k];
      if (prof) {
        a.followers = prof.followers_count ?? a.followers;
        a.pictureUrl = prof.profile_picture_url ?? a.pictureUrl;
        a.name = prof.name ?? a.name;
        a.refreshedAt = Date.now();
      }
    }
  });
}

async function daily(today: string) {
  await snapshotFollowers(today);
  // Token health: a broken token should show up in Settings long before a scheduled post hits it.
  const conn = await getConnection();
  if (conn.userTokenEnc && process.env.META_APP_ID) {
    try {
      const info = await debugToken(decrypt(conn.userTokenEnc));
      if (!info.is_valid) {
        await mutateConnection((c) => {
          for (const k of LK) if (c.accounts[k]) c.accounts[k]!.lastError ??= "Facebook says the connection is no longer valid. Reconnect.";
        });
      }
    } catch {
      /* reported via the account checks above */
    }
  }
  await backup(today);
  return "ok";
}

/** Nightly JSON backup of everything except Meta tokens, kept for 30 days. */
export async function backup(today: string) {
  const [posts, inspo, plans, notes, settings] = await Promise.all([listPosts(), listInspo(), listPlans(), getKv("inspoNotes", () => ({})), getSettings()]);
  const followers: Record<string, Record<string, string>> = {};
  for (const k of LK) followers[k] = hashToObject(await redis().hgetall(`followers:${k}`));
  const body = JSON.stringify({ app: "tradr-studio", version: 2, exportedAt: new Date().toISOString(), settings, posts, inspo, plans, notes, followers });
  await put(`backups/tradr-studio-${today}.json`, body, { access: "public", contentType: "application/json", addRandomSuffix: true });
  const { blobs } = await list({ prefix: "backups/" });
  const old = blobs.filter((b) => Date.now() - new Date(b.uploadedAt).getTime() > 30 * 864e5).map((b) => b.url);
  if (old.length) await del(old);
}

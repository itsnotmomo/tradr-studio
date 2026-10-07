import "server-only";
import { redis } from "./redis";
import { listPosts } from "./store";
import { getSettings } from "./settings";
import { LANGS, LK } from "../langs";
import { publishAt, slotName } from "../slots";
import { isDone } from "../status";
import { addDays, fmtDate, parseYmd, utcToZoned, weekStart, ymd } from "../time";
import type { Lang, Post, Settings } from "../types";

// Push notifications through ntfy.sh on a private, hard-to-guess topic (NTFY_TOPIC).
// Every notification takes a one-time Redis key before it's sent, so a late or doubled cron
// run can never send it twice.

const ORIGIN = (process.env.APP_URL || "https://tradr-studio.vercel.app").replace(/\/$/, "");
const SLOT_WINDOW = 45 * 60_000; // a late cron still sends the slot reminder within this window
const MISSED_AFTER = 2 * 3600_000;
const MISSED_WINDOW = 6 * 3600_000; // don't dig up old misses

export async function sendNtfy(title: string, message: string, path: string) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) throw new Error("NTFY_TOPIC isn't set");
  const res = await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    body: message,
    headers: { Title: title, Click: `${ORIGIN}${path}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ntfy returned ${res.status}`);
}

/** Sends once per key. If sending fails, the key is released so the next run retries. */
async function once(key: string, ttlSec: number, send: () => Promise<void>) {
  const got = await redis().set(`notif:${key}`, "1", { nx: true, ex: ttlSec });
  if (!got) return false;
  try {
    await send();
    return true;
  } catch (e) {
    await redis().del(`notif:${key}`);
    throw e;
  }
}

const code = (k: Lang) => LANGS.find((l) => l.k === k)!.code;
const name = (p: Post) => `'${p.title.trim() || "Untitled"}'`;
const postScreen = (p: Post, k: Lang) => `/go/${p.id}/${k}`;

export async function runNotifications(now = Date.now()) {
  const [s, posts] = await Promise.all([getSettings(), listPosts()]);
  const sent: string[] = [];
  const planned = posts.filter((p) => p.date);

  for (const p of planned) {
    for (const k of LK) {
      const at = publishAt(s, k, p.date!, p.slot);
      const st = p.variants[k].status;
      const local = s.schedule[k][p.slot];
      // Slot reminder at the account's local slot time.
      if (s.notify.slots && now >= at && now < at + SLOT_WINDOW && st !== "posted") {
        const msg = st === "scheduled"
          ? `${code(k)} · ${local} · ${name(p)} goes live now`
          : `${code(k)} · ${local} · ${name(p)} — post it now`;
        if (await once(`slot:${p.id}:${k}:${at}`, 3 * 86400, () => sendNtfy("Tradr Studio", msg, postScreen(p, k)))) sent.push(msg);
      }
      // One follow-up if it's still not scheduled or posted 2 hours later.
      if (s.notify.missed && !isDone(st) && now >= at + MISSED_AFTER && now < at + MISSED_AFTER + MISSED_WINDOW) {
        const msg = `Missed: ${code(k)} · ${name(p)} wasn't posted`;
        if (await once(`missed:${p.id}:${k}:${at}`, 7 * 86400, () => sendNtfy("Tradr Studio", msg, postScreen(p, k)))) sent.push(msg);
      }
    }
  }

  // Weekly batch, Mondays at the chosen time in your zone.
  if (s.notify.weekly) {
    const z = utcToZoned(now, s.timezone);
    const isMonday = parseYmd(z.date).getDay() === 1;
    if (isMonday && z.time >= s.notify.weeklyTime) {
      const msg = weeklyMessage(s, planned, z.date);
      if (await once(`weekly:${z.date}`, 8 * 86400, () => sendNtfy("Weekly batch", msg, "/batch"))) sent.push(msg);
    }
  }
  return sent;
}

export function weeklyMessage(_s: Settings, planned: Post[], todayYmd: string) {
  const start = weekStart(parseYmd(todayYmd));
  const days = [...Array(7)].map((_, i) => ymd(addDays(start, i)));
  const week = planned.filter((p) => days.includes(p.date!)).sort((a, b) => a.date!.localeCompare(b.date!) || (a.slot === "morning" ? -1 : 1));
  const notScheduled = week.filter((p) => LK.some((k) => !isDone(p.variants[k].status))).length;
  const head = `Weekly batch: ${week.length} post${week.length === 1 ? "" : "s"} this week.${week.length ? ` ${notScheduled} not scheduled yet.` : ""}`;
  const lines = days
    .map((d) => [d, week.filter((p) => p.date === d)] as const)
    .filter(([, ps]) => ps.length)
    .map(([d, ps]) => `${fmtDate(d, { weekday: "short" })}: ${ps.map((p) => `${p.title.trim() || "Untitled"} (${slotName(p.slot)})`).join(", ")}`);
  return [head, ...lines].join("\n");
}

import "server-only";
import { redis } from "./redis";
import { sendNtfy } from "./notify";
import { relTime } from "../time";

// If the every-minute tick stops, something other than the tick has to notice. The watchdog
// endpoint is called by GitHub Actions (every 30 min) and Vercel Cron (daily). It alerts once
// when the tick has been silent for 30+ minutes; the next tick sends one "running again".

const STALE_MS = 30 * 60_000;
const ALERTED = "watchdog:alerted";

export async function checkScheduler(now = Date.now()) {
  const last = Number((await redis().get("sched:last")) || 0);
  if (last && now - last < STALE_MS) return { ok: true, last };
  const first = await redis().set(ALERTED, String(now), { nx: true });
  if (first) {
    try {
      await sendNtfy("Tradr Studio", `Scheduler stopped: last ran ${last ? relTime(last, now) : "never"}. Reminders are paused.`, "/settings#scheduler");
    } catch (e) {
      await redis().del(ALERTED);
      throw e;
    }
  }
  return { ok: false, last, alerted: !!first };
}

/** Called from every tick: if an alert went out, say once that it's running again. */
export async function noteRecovery() {
  const was = await redis().getdel(ALERTED);
  if (was) await sendNtfy("Tradr Studio", "Scheduler is running again. Reminders are back on.", "/settings#scheduler").catch(() => {});
}

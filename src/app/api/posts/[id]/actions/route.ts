import { after } from "next/server";
import { body, route } from "@/lib/server/api";
import { getPost, listPosts, mutatePost, NotFoundError, UserError } from "@/lib/server/store";
import { getConnection, getSettings } from "@/lib/server/settings";
import { publishVariant, refreshMetrics } from "@/lib/server/publisher";
import { resolveSchedule } from "@/lib/server/posts";
import { preflight } from "@/lib/preflight";
import { isLang, langInfo } from "@/lib/langs";
import { freeSlot, slotFromTime } from "@/lib/slots";
import { fmtDate, utcToZoned } from "@/lib/time";
import type { Lang, Slot } from "@/lib/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
type Action = "schedule" | "now" | "unschedule" | "retry" | "metrics";

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<{ action: Action; langs: string[] }>(req);
  const langs = (b.langs || []).filter(isLang) as Lang[];
  if (!langs.length) throw new UserError("Pick at least one language");
  const [s, conn, cur] = await Promise.all([getSettings(), getConnection(), getPost(id)]);
  if (!cur) throw new NotFoundError();
  const now = Date.now();
  const log = (msg: string) => ({ at: now, msg });

  const check = (ks: Lang[]) => {
    const msgs = ks.flatMap((k) => preflight(k, cur.variants[k], s.langs[k], !!conn.accounts[k]).problems.map((m) => `${langInfo(k).code}: ${m}`));
    if (msgs.length) throw new UserError(msgs.join("\n"));
  };

  if (b.action === "schedule") {
    if (!cur.date) throw new UserError("Put the post on a day first.");
    const ks = langs.filter((k) => ["idle", "failed"].includes(cur.variants[k].state));
    if (!ks.length) throw new UserError("Nothing to schedule. Those versions are already scheduled or posted.");
    check(ks);
    const post = await mutatePost(id, (p) => {
      const open = ks.filter((k) => ["idle", "failed"].includes(p.variants[k].state));
      resolveSchedule(p, s, now, open); // each account's own local time for this slot
      for (const k of open) {
        const v = p.variants[k];
        Object.assign(v, { state: "scheduled", attempts: 0, error: null, ready: true });
        v.log = [...v.log, log(`Scheduled for ${new Date(v.scheduledAt!).toISOString()}`)].slice(-30);
      }
    });
    return { post };
  }

  if (b.action === "now" || b.action === "retry") {
    const ks = langs.filter((k) => ["idle", "failed", "scheduled"].includes(cur.variants[k].state));
    if (!ks.length) throw new UserError("Nothing to post. Those versions are already posted or publishing.");
    check(ks);
    // A post sent straight from Ideas lands on today's nearest free slot.
    let placeOn: { date: string; slot: Slot } | null = null;
    if (!cur.date) {
      const z = utcToZoned(now, s.timezone);
      const slot = freeSlot(await listPosts(), z.date, id, slotFromTime(z.time));
      if (!slot) throw new UserError(`Both slots today (${fmtDate(z.date, { day: "numeric", month: "short" })}) are taken. Put this post on another day first.`, 409);
      placeOn = { date: z.date, slot };
    }
    const post = await mutatePost(id, (p) => {
      if (placeOn && !p.date) Object.assign(p, placeOn);
      for (const k of ks) {
        const v = p.variants[k];
        if (!["idle", "failed", "scheduled"].includes(v.state)) continue;
        Object.assign(v, { state: "scheduled", scheduledAt: now, nextAttemptAt: null, attempts: 0, error: null, ready: true, postNow: true });
        v.log = [...v.log, log(b.action === "retry" ? "Retry requested" : "Post now requested")].slice(-30);
      }
    });
    // Publish after responding, so closing the phone doesn't interrupt it. The scheduler is the safety net.
    after(() => Promise.all(ks.map((k) => publishVariant(id, k))));
    return { post };
  }

  if (b.action === "unschedule") {
    const post = await mutatePost(id, (p) => {
      for (const k of langs) {
        const v = p.variants[k];
        if (v.state === "scheduled" || v.state === "failed") {
          Object.assign(v, { state: "idle", scheduledAt: null, nextAttemptAt: null, error: null, postNow: false });
          v.log = [...v.log, log("Unscheduled")].slice(-30);
        }
      }
    });
    return { post };
  }

  if (b.action === "metrics") {
    for (const k of langs) await refreshMetrics(id, k);
    return { post: await getPost(id) };
  }

  throw new UserError("Unknown action");
});

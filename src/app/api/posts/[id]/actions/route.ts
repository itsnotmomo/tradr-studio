import { after } from "next/server";
import { body, route } from "@/lib/server/api";
import { getPost, mutatePost, NotFoundError, UserError } from "@/lib/server/store";
import { getConnection, getSettings } from "@/lib/server/settings";
import { publishVariant, refreshMetrics } from "@/lib/server/publisher";
import { preflight } from "@/lib/preflight";
import { isLang, langInfo } from "@/lib/langs";
import { utcToZoned, zonedToUtc } from "@/lib/time";
import type { Lang } from "@/lib/types";

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

  const check = (ks: Lang[]) => {
    const msgs = ks.flatMap((k) => preflight(k, cur.variants[k], s.langs[k], !!conn.accounts[k]).problems.map((m) => `${langInfo(k).code}: ${m}`));
    if (msgs.length) throw new UserError(msgs.join("\n"));
  };

  if (b.action === "schedule") {
    if (!cur.date) throw new UserError("Give the post a date and time first.");
    const at = zonedToUtc(cur.date, cur.time, s.timezone);
    if (at < now + 60_000) throw new UserError("That time has already passed. Pick a later time or use Post now.");
    const ks = langs.filter((k) => ["idle", "failed"].includes(cur.variants[k].state));
    if (!ks.length) throw new UserError("Nothing to schedule. Those versions are already scheduled or posted.");
    check(ks);
    const post = await mutatePost(id, (p) => {
      for (const k of ks) {
        const v = p.variants[k];
        if (!["idle", "failed"].includes(v.state)) continue;
        Object.assign(v, { state: "scheduled", scheduledAt: at, nextAttemptAt: null, attempts: 0, error: null, ready: true });
        v.log = [...v.log, { at: now, msg: `Scheduled for ${cur.date} ${cur.time}` }].slice(-30);
      }
    });
    return { post };
  }

  if (b.action === "now" || b.action === "retry") {
    const ks = langs.filter((k) => ["idle", "failed", "scheduled"].includes(cur.variants[k].state));
    if (!ks.length) throw new UserError("Nothing to post. Those versions are already posted or publishing.");
    check(ks);
    const post = await mutatePost(id, (p) => {
      // A post sent from Ideas lands on today in the planner.
      if (!p.date || !Object.values(p.variants).some((v) => ["scheduled", "posted"].includes(v.state))) {
        const z = utcToZoned(now, s.timezone);
        p.date = z.date;
        p.time = z.time;
      }
      for (const k of ks) {
        const v = p.variants[k];
        if (!["idle", "failed", "scheduled"].includes(v.state)) continue;
        Object.assign(v, { state: "scheduled", scheduledAt: now, nextAttemptAt: null, attempts: 0, error: null, ready: true });
        v.log = [...v.log, { at: now, msg: b.action === "retry" ? "Retry requested" : "Post now requested" }].slice(-30);
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
          Object.assign(v, { state: "idle", scheduledAt: null, nextAttemptAt: null, error: null });
          v.log = [...v.log, { at: now, msg: "Unscheduled" }].slice(-30);
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

import { body, route } from "@/lib/server/api";
import { getSettings, mutateSettings } from "@/lib/server/settings";
import { listPosts, mutatePost, UserError } from "@/lib/server/store";
import { cleanSlides } from "@/lib/server/posts";
import { isLang, LK } from "@/lib/langs";
import { publishAt } from "@/lib/slots";
import { isValidHm } from "@/lib/time";

type SettingsPatch = {
  timezone?: string;
  langs?: Partial<Record<string, { tradr?: string; hashtags?: string; tradrSlide?: unknown }>>;
  schedule?: Partial<Record<string, { zone?: string; morning?: string; afternoon?: string; reel?: string }>>;
  applyDefaultsTo?: string;
  notify?: { weekly?: boolean; slots?: boolean; missed?: boolean; weeklyTime?: string };
};

const validZone = (z: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return true;
  } catch {
    return false;
  }
};

export const GET = route(async () => getSettings());

export const PATCH = route(async (req) => {
  const b = await body<SettingsPatch>(req);
  if (b.timezone && !validZone(b.timezone)) throw new UserError("Unknown time zone");
  for (const sp of Object.values(b.schedule || {})) {
    if (sp?.zone && !validZone(sp.zone)) throw new UserError("Unknown time zone");
    for (const t of [sp?.morning, sp?.afternoon, sp?.reel]) if (t !== undefined && !isValidHm(t)) throw new UserError("Times look like 10:00");
  }
  if (b.notify?.weeklyTime !== undefined && !isValidHm(b.notify.weeklyTime)) throw new UserError("Times look like 09:00");
  const s = await mutateSettings((s) => {
    if (b.timezone) s.timezone = b.timezone;
    if (b.notify) {
      for (const f of ["weekly", "slots", "missed"] as const) if (b.notify[f] !== undefined) s.notify[f] = !!b.notify[f];
      if (b.notify.weeklyTime) s.notify.weeklyTime = b.notify.weeklyTime;
    }
    for (const [k, lp] of Object.entries(b.langs || {})) {
      if (!isLang(k) || !lp) continue;
      if (lp.tradr !== undefined) s.langs[k].tradr = String(lp.tradr);
      if (lp.hashtags !== undefined) s.langs[k].hashtags = String(lp.hashtags);
      if (lp.tradrSlide !== undefined) s.langs[k].tradrSlide = lp.tradrSlide ? cleanSlides([lp.tradrSlide])[0] : null;
    }
    for (const [k, sp] of Object.entries(b.schedule || {})) {
      if (!isLang(k) || !sp) continue;
      for (const f of ["zone", "morning", "afternoon", "reel"] as const) if (sp[f] !== undefined) s.schedule[k][f] = sp[f]!;
    }
  });

  let updated = 0, rescheduled = 0;
  // New slot times apply to everything already scheduled.
  if (b.schedule) {
    const now = Date.now();
    for (const p of await listPosts()) {
      if (!p.date || !LK.some((k) => p.variants[k].state === "scheduled" && !p.variants[k].postNow)) continue;
      await mutatePost(p.id, (x) => {
        for (const k of LK) {
          const v = x.variants[k];
          if (v.state !== "scheduled" || v.postNow || !x.date) continue;
          const at = publishAt(s, k, x.date, x.slot);
          if (at > now && at !== v.scheduledAt) {
            v.scheduledAt = at;
            v.nextAttemptAt = null;
            rescheduled++;
          }
        }
      });
    }
  }
  // "Apply defaults to posts not posted yet"
  if (b.applyDefaultsTo && isLang(b.applyDefaultsTo)) {
    const k = b.applyDefaultsTo;
    for (const p of await listPosts()) {
      if (["posted", "publishing"].includes(p.variants[k].state) || p.variants[k].status === "posted") continue;
      await mutatePost(p.id, (x) => {
        x.variants[k].tradr = s.langs[k].tradr;
        x.variants[k].hashtags = s.langs[k].hashtags;
      });
      updated++;
    }
  }
  return { settings: s, updated, rescheduled };
});

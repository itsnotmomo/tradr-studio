import { body, route } from "@/lib/server/api";
import { getSettings, mutateSettings } from "@/lib/server/settings";
import { listPosts, mutatePost, UserError } from "@/lib/server/store";
import { cleanSlides } from "@/lib/server/posts";
import { isLang } from "@/lib/langs";
import { isValidHm } from "@/lib/time";

type SettingsPatch = {
  timezone?: string; defaultTime?: string;
  langs?: Partial<Record<string, { tradr?: string; hashtags?: string; tradrSlide?: unknown }>>;
  applyDefaultsTo?: string;
};

export const GET = route(async () => getSettings());

export const PATCH = route(async (req) => {
  const b = await body<SettingsPatch>(req);
  if (b.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      throw new UserError("Unknown time zone");
    }
  }
  if (b.defaultTime && !isValidHm(b.defaultTime)) throw new UserError("Invalid time");
  const s = await mutateSettings((s) => {
    if (b.timezone) s.timezone = b.timezone;
    if (b.defaultTime) s.defaultTime = b.defaultTime;
    for (const [k, lp] of Object.entries(b.langs || {})) {
      if (!isLang(k) || !lp) continue;
      if (lp.tradr !== undefined) s.langs[k].tradr = String(lp.tradr);
      if (lp.hashtags !== undefined) s.langs[k].hashtags = String(lp.hashtags);
      if (lp.tradrSlide !== undefined) s.langs[k].tradrSlide = lp.tradrSlide ? cleanSlides([lp.tradrSlide])[0] : null;
    }
  });
  // "Apply defaults to posts not posted yet"
  let updated = 0;
  if (b.applyDefaultsTo && isLang(b.applyDefaultsTo)) {
    const k = b.applyDefaultsTo;
    for (const p of await listPosts()) {
      if (["posted", "publishing"].includes(p.variants[k].state)) continue;
      await mutatePost(p.id, (x) => {
        x.variants[k].tradr = s.langs[k].tradr;
        x.variants[k].hashtags = s.langs[k].hashtags;
      });
      updated++;
    }
  }
  return { settings: s, updated };
});

import { body, route } from "@/lib/server/api";
import { createPost, mutateInspo, UserError } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import { cleanSlides } from "@/lib/server/posts";
import { isLang } from "@/lib/langs";
import { isValidHm, isValidYmd } from "@/lib/time";
import type { Lang, Variant } from "@/lib/types";

export const POST = route(async (req) => {
  const b = await body<{ title?: string; date?: string | null; time?: string; inspoId?: string; slides?: Record<string, unknown> }>(req);
  if (b.date && !isValidYmd(b.date)) throw new UserError("Invalid date");
  if (b.time && !isValidHm(b.time)) throw new UserError("Invalid time");
  const s = await getSettings();
  const variants: Partial<Record<Lang, Partial<Variant>>> = {};
  for (const [k, slides] of Object.entries(b.slides || {})) if (isLang(k)) variants[k] = { slides: cleanSlides(slides) };
  const post = await createPost(
    { title: String(b.title || "").slice(0, 200), date: b.date || null, time: b.time || s.defaultTime, inspoId: b.inspoId || null, variants: variants as Record<Lang, Variant> },
    s,
  );
  if (b.inspoId) {
    await mutateInspo(b.inspoId, (d) => {
      d.postId = post.id;
      d.status = "done";
    }).catch(() => {});
  }
  return post;
});

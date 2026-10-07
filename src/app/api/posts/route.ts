import { body, route } from "@/lib/server/api";
import { createPost, listPosts, mutateInspo, UserError } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import { cleanSlides, NAME_REQUIRED, slotConflictMessage } from "@/lib/server/posts";
import { mutatePlan } from "@/lib/server/store";
import { isLang } from "@/lib/langs";
import { freeSlot, isPostSlot, slotTaken } from "@/lib/slots";
import { fmtDate, isValidYmd } from "@/lib/time";
import type { Lang, Slot, Variant } from "@/lib/types";

export const POST = route(async (req) => {
  const b = await body<{ title?: string; date?: string | null; slot?: string; kind?: string; inspoId?: string; planId?: string; slides?: Record<string, unknown> }>(req);
  const kind = b.kind === "reel" ? "reel" : "post";
  if (b.date && !isValidYmd(b.date)) throw new UserError("Invalid date");
  if (b.date && !String(b.title || "").trim()) throw new UserError(NAME_REQUIRED, 422);
  const [s, posts] = await Promise.all([getSettings(), listPosts()]);
  let slot: Slot = kind === "reel" ? "reel" : isPostSlot(b.slot) ? b.slot : "morning";
  if (b.date && kind === "reel") {
    const other = slotTaken(posts, b.date, "reel");
    if (other) throw new UserError(slotConflictMessage(other, b.date, "reel"), 409);
  } else if (b.date) {
    if (isPostSlot(b.slot)) {
      const other = slotTaken(posts, b.date, b.slot);
      if (other) throw new UserError(slotConflictMessage(other, b.date, b.slot), 409);
    } else {
      const free = freeSlot(posts, b.date);
      if (!free) throw new UserError(`Both slots on ${fmtDate(b.date, { weekday: "short", day: "numeric", month: "short" })} are taken. Pick another day, or save it to Ideas.`, 409);
      slot = free;
    }
  }
  const variants: Partial<Record<Lang, Partial<Variant>>> = {};
  for (const [k, slides] of Object.entries(b.slides || {})) if (isLang(k)) variants[k] = { slides: cleanSlides(slides) };
  const post = await createPost(
    { title: String(b.title || "").slice(0, 200), date: b.date || null, slot, kind, inspoId: b.inspoId || null, variants: variants as Record<Lang, Variant> },
    s,
  );
  // Making a post from an inspo item marks it done and links it.
  if (b.inspoId) {
    await mutateInspo(b.inspoId, (d) => {
      d.postId = post.id;
      d.status = "done";
    }).catch(() => {});
  }
  if (b.planId) {
    await mutatePlan(b.planId, (d) => {
      d.postId = post.id;
    }).catch(() => {});
  }
  return post;
});

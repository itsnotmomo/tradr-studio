import { body, route } from "@/lib/server/api";
import { IG_MAX_LEAD_MS, IG_MIN_LEAD_MS, TRADR_NEWS_CATEGORIES, type NewsDraft, type TradrNewsChoice } from "@/lib/news";
import { deleteNews, getNews, mutateNews, UserError } from "@/lib/server/store";
import { publishToTradrNews, unpublishFromTradrNews } from "@/lib/server/tradrNews";

type Ctx = { params: Promise<{ id: string }> };
type Action = "approve" | "reject" | "changes" | "posted" | "unpost" | "reopen" | "post" | "post-cancel" | "tradr-news" | "tradr-news-remove";

function newsChoice(raw: unknown): TradrNewsChoice | null {
  const c = raw as { category?: string; breaking?: boolean } | null | undefined;
  if (!c) return null;
  if (!TRADR_NEWS_CATEGORIES.some((x) => x.id === c.category)) throw new UserError("Pick a Tradr News category.");
  return { category: c.category as TradrNewsChoice["category"], breaking: !!c.breaking };
}

/** Publishes to Tradr News and records the result on the draft (the call happens outside the CAS write). */
async function toTradrNews(d: NewsDraft, choice: TradrNewsChoice, what: string) {
  const state = await publishToTradrNews(d, choice);
  return mutateNews(d.id, (x) => {
    x.tradrNews = state;
    x.history.push({ at: Date.now(), what: state.state === "published" ? `${what} on Tradr News` : `Tradr News failed: ${state.error}` });
  });
}

// Review actions. Changes are made by the next "make news posts" run, which reads changeNote.
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<{ action: Action; note?: string; igAt?: number; news?: unknown }>(req);
  const note = String(b.note || "").trim().slice(0, 2000);

  // Tradr News on its own: publish (or update) / remove.
  if (b.action === "tradr-news") {
    const d = await getNews(id);
    if (!d) throw new UserError("Not found.", 404);
    const choice = newsChoice(b.news);
    if (!choice) throw new UserError("Pick a Tradr News category.");
    return toTradrNews(d, choice, d.tradrNews?.state === "published" ? "Updated" : "Published");
  }
  if (b.action === "tradr-news-remove") {
    const d = await getNews(id);
    if (!d?.tradrNews) throw new UserError("It isn't on Tradr News.");
    const state = await unpublishFromTradrNews(d);
    return mutateNews(id, (x) => {
      x.tradrNews = state;
      x.history.push({ at: Date.now(), what: state.state === "hidden" ? "Removed from Tradr News" : `Tradr News removal failed: ${state.error}` });
    });
  }

  // Post with "Publish to Tradr News" on: Instagram and X are queued for the poster as before, and the
  // article goes up on Tradr News at once (like the tweet).
  const postNews = b.action === "post" ? newsChoice(b.news) : null;
  const saved = await mutateNews(id, (d) => {
    const now = Date.now();
    switch (b.action) {
      case "approve":
        d.status = "approved"; d.approvedAt = now; d.history.push({ at: now, what: "Approved" });
        break;
      case "reject":
        d.status = "rejected"; d.history.push({ at: now, what: note ? `Rejected: ${note}` : "Rejected" });
        break;
      case "changes":
        if (!note) throw new UserError("Write what to change.");
        d.status = "changes"; d.changeNote = note; d.history.push({ at: now, what: `Changes asked: ${note}` });
        break;
      case "posted":
        if (d.status !== "approved") throw new UserError("Approve it first.");
        d.status = "posted"; d.postedAt = now; d.history.push({ at: now, what: "Marked posted" });
        break;
      case "unpost":
        d.status = "approved"; d.postedAt = null; d.history.push({ at: now, what: "Posted mark removed" });
        break;
      case "reopen":
        d.status = "draft"; d.changeNote = ""; d.history.push({ at: now, what: "Back to draft" });
        break;
      case "post": {
        // One-button posting: the poster on the Mac picks this up (scripts/news/poster.ts).
        // Every draft keeps its Post button (Mohamed, 17 Nov 2026): posted ones can be posted or rescheduled again.
        // Only a post already on its way is refused.
        if (d.post && (d.post.state === "queued" || d.post.state === "running")) throw new UserError("Already on its way.");
        const keep = d.post?.state === "failed" ? d.post : null; // a retry keeps what already went out
        const again = d.post?.state === "done" ? d.post : null; // posting again: Instagram is scheduled anew
        // A tweet that went out is never sent twice; posting again only reschedules Instagram.
        const tweetUrl = keep?.tweetUrl ?? again?.tweetUrl ?? null;
        // When the Instagram post goes live: the time picked with the Post button (default 24 h). A retry after Instagram
        // was already scheduled keeps that time; only the tweet is left to do.
        let igAt: number;
        if (keep?.igScheduledAt) igAt = keep.igAt;
        else if (b.igAt != null) {
          igAt = Math.ceil(Number(b.igAt) / 60e3) * 60e3;
          if (!Number.isFinite(igAt)) throw new UserError("Pick a time for Instagram.");
          if (igAt - now < IG_MIN_LEAD_MS) throw new UserError(`Instagram needs at least ${IG_MIN_LEAD_MS / 60e3} minutes' notice. Pick a later time.`);
          if (igAt - now > IG_MAX_LEAD_MS) throw new UserError("Instagram schedules at most 29 days ahead. Pick an earlier time.");
        } else igAt = Math.ceil((now + 24 * 3600e3) / 300e3) * 300e3;
        d.post = { state: "queued", requestedAt: now, igAt, igScheduledAt: keep?.igScheduledAt ?? null, tweetUrl, error: null, updatedAt: now };
        if (d.status !== "approved") { d.status = "approved"; d.approvedAt = now; }
        d.history.push({ at: now, what: keep ? "Post retried" : again ? "Post pressed again (Instagram rescheduled)" : "Post pressed" });
        break;
      }
      case "post-cancel":
        if (d.post?.state !== "queued") throw new UserError("It's already being posted.");
        d.post = null; d.history.push({ at: now, what: "Post cancelled" });
        break;
      default:
        throw new UserError("Unknown action");
    }
  });
  if (postNews) return toTradrNews(saved, postNews, "Published with the post");
  return saved;
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const d = await getNews(id);
  if (d && d.status !== "rejected") throw new UserError("Only rejected drafts can be deleted.");
  await deleteNews(id);
  return { ok: true };
});

import { body, route } from "@/lib/server/api";
import { IG_MAX_LEAD_MS, IG_MIN_LEAD_MS } from "@/lib/news";
import { deleteNews, getNews, mutateNews, UserError } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };
type Action = "approve" | "reject" | "changes" | "posted" | "unpost" | "reopen" | "post" | "post-cancel" | "edit" | "swapSlide";

// Review actions. Changes are made by the next "make news posts" run, which reads changeNote.
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<{ action: Action; note?: string; igAt?: number; field?: "caption" | "x"; value?: string; index?: number; url?: string; w?: number; h?: number }>(req);
  const note = String(b.note || "").trim().slice(0, 2000);
  return mutateNews(id, (d) => {
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
      case "edit": {
        // A hand edit of the caption or the X text. Kept as before/after so the scout learns from it (taste file).
        if (d.post && (d.post.state === "queued" || d.post.state === "running")) throw new UserError("It's being posted right now. Edit it after.");
        if (b.field !== "caption" && b.field !== "x") throw new UserError("Unknown field");
        const value = String(b.value ?? "").replace(/\r\n/g, "\n").trim();
        if (!value) throw new UserError(b.field === "x" ? "The X text can't be empty." : "The caption can't be empty.");
        if (b.field === "x" && value.length > 280) throw new UserError(`The X text is ${value.length} characters (max 280).`);
        if (b.field === "x" && /https?:\/\//.test(value)) throw new UserError("No links in the X text.");
        if (b.field === "caption" && value.length > 2200) throw new UserError("Instagram captions stop at 2,200 characters.");
        const before = d[b.field];
        if (before === value) break;
        d[b.field] = value;
        const spec = (d as unknown as { spec?: Record<string, unknown> }).spec;
        if (spec) spec[b.field] = value; // a redo starts from the edited text
        (d.edits ??= []).push({ at: now, field: b.field, before, after: value });
        d.history.push({ at: now, what: `Edited the ${b.field === "x" ? "X text" : "caption"} by hand` });
        break;
      }
      case "swapSlide": {
        // A slide replaced by hand with an uploaded image (Blob). The old one is kept in edits.
        if (d.post && (d.post.state === "queued" || d.post.state === "running")) throw new UserError("It's being posted right now. Edit it after.");
        const i = Number(b.index);
        if (!Number.isInteger(i) || i < 0 || i >= d.slides.length) throw new UserError("Unknown slide");
        if (!b.url || !/\.public\.blob\.vercel-storage\.com\//.test(b.url)) throw new UserError("Upload the image first.");
        const before = d.slides[i].url;
        d.slides[i] = { kind: "image", url: b.url, w: Number(b.w) || 1080, h: Number(b.h) || 1350 };
        (d.edits ??= []).push({ at: now, field: "slide", slide: i + 1, before, after: b.url });
        d.history.push({ at: now, what: `Swapped slide ${i + 1} by hand` });
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
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const d = await getNews(id);
  if (d && d.status !== "rejected") throw new UserError("Only rejected drafts can be deleted.");
  await deleteNews(id);
  return { ok: true };
});

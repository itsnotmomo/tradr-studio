import { body, route } from "@/lib/server/api";
import { deleteNews, getNews, mutateNews, UserError } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };
type Action = "approve" | "reject" | "changes" | "posted" | "unpost" | "reopen" | "post" | "post-cancel";

// Review actions. Changes are made by the next "make news posts" run, which reads changeNote.
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<{ action: Action; note?: string }>(req);
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
        if (d.status === "rejected" || d.status === "posted") throw new UserError("This one can't be posted.");
        if (d.post && (d.post.state === "queued" || d.post.state === "running")) throw new UserError("Already on its way.");
        const keep = d.post?.state === "failed" ? d.post : null; // a retry keeps what already went out
        const igAt = keep?.igAt && keep.igAt - now > 30 * 60e3 ? keep.igAt : Math.ceil((now + 24 * 3600e3) / 300e3) * 300e3;
        d.post = { state: "queued", requestedAt: now, igAt, igScheduledAt: keep?.igScheduledAt ?? null, tweetUrl: keep?.tweetUrl ?? null, error: null, updatedAt: now };
        if (d.status !== "approved") { d.status = "approved"; d.approvedAt = now; }
        d.history.push({ at: now, what: keep ? "Post retried" : "Post pressed" });
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

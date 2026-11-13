import { body, route } from "@/lib/server/api";
import { deleteNews, getNews, mutateNews, UserError } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };
type Action = "approve" | "reject" | "changes" | "posted" | "unpost" | "reopen";

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

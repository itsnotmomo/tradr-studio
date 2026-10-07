import { body, route } from "@/lib/server/api";
import { deleteInspo, mutateInspo } from "@/lib/server/store";
import type { Inspo } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<Partial<Inspo>>(req);
  return mutateInspo(id, (d) => {
    if (b.status && ["todo", "skip", "done"].includes(b.status)) d.status = b.status;
    if (Array.isArray(b.tags)) d.tags = [...new Set(b.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    if (b.notes !== undefined) d.notes = String(b.notes).slice(0, 5000);
    if (b.caption !== undefined) d.caption = String(b.caption).slice(0, 5000);
    if (b.username !== undefined) d.username = String(b.username || "").replace(/^@/, "").trim() || null;
    if (b.postId !== undefined) d.postId = b.postId || null;
    if (Array.isArray(b.images)) d.images = b.images.filter((i) => /\.public\.blob\.vercel-storage\.com\//.test(i.url)).slice(0, 20);
  });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await deleteInspo((await params).id);
  return { ok: true };
});

import { body, route } from "@/lib/server/api";
import { deleteInspo, mutateInspo } from "@/lib/server/store";
import { parseInstagramUrl } from "@/lib/igurl";
import type { Inspo } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<Partial<Inspo>>(req);
  return mutateInspo(id, (d) => {
    if (b.status && ["todo", "skip", "done"].includes(b.status)) d.status = b.status;
    if (Array.isArray(b.tags)) d.tags = [...new Set(b.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    if (b.notes !== undefined) d.notes = String(b.notes).slice(0, 5000);
    if (b.description !== undefined) d.description = String(b.description).slice(0, 2000);
    if (b.url !== undefined) {
      const parsed = b.url ? parseInstagramUrl(b.url) : null;
      d.url = parsed?.url ?? null;
      d.shortcode = parsed?.shortcode ?? null;
      if (parsed?.username && !d.username) d.username = parsed.username;
    }
    if (b.username !== undefined) d.username = String(b.username || "").replace(/^@/, "").trim() || null;
    if (b.postId !== undefined) d.postId = b.postId || null;
    if (Array.isArray(b.images)) d.images = b.images.filter((i) => /\.public\.blob\.vercel-storage\.com\//.test(i.url)).slice(0, 20);
  });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await deleteInspo((await params).id);
  return { ok: true };
});

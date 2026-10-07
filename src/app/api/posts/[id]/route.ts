import { body, route } from "@/lib/server/api";
import { deletePost, getPost, listPosts, mutatePost, NotFoundError, UserError } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import { applyPatch, type PostPatch } from "@/lib/server/posts";
import { LK } from "@/lib/langs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const p = await getPost((await params).id);
  if (!p) throw new NotFoundError();
  return p;
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const patch = await body<PostPatch>(req);
  const [s, others] = await Promise.all([getSettings(), patch.date !== undefined || patch.slot !== undefined ? listPosts() : Promise.resolve([])]);
  let notes: string[] = [];
  const post = await mutatePost(id, (p) => {
    notes = applyPatch(p, patch, s, others);
  });
  return { post, notes };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const p = await getPost(id);
  if (!p) return { ok: true };
  if (LK.some((k) => p.variants[k].state === "publishing")) throw new UserError("This post is publishing right now. Wait a moment.");
  await deletePost(id);
  return { ok: true };
});

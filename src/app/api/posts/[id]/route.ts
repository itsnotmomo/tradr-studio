import { body, route } from "@/lib/server/api";
import { deletePost, getPost, listPosts, mutatePost, NotFoundError, UserError } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import { applyPatch, type PostPatch } from "@/lib/server/posts";
import { checkReelMedia, deleteVideoFiles, videoUrls } from "@/lib/server/videos";
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
  await checkReelMedia(patch);
  const [s, others] = await Promise.all([getSettings(), patch.date !== undefined || patch.slot !== undefined ? listPosts() : Promise.resolve([])]);
  let notes: string[] = [];
  let before: string[] = [];
  const post = await mutatePost(id, (p) => {
    before = videoUrls(p);
    notes = applyPatch(p, patch, s, others);
  });
  // A replaced or removed video is deleted straight away (storage is tight).
  const after = new Set(videoUrls(post));
  await deleteVideoFiles(before.filter((u) => !after.has(u))).catch((e) => console.error("video delete failed", e));
  return { post, notes };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const p = await getPost(id);
  if (!p) return { ok: true };
  if (LK.some((k) => p.variants[k].state === "publishing")) throw new UserError("This post is publishing right now. Wait a moment.");
  await deletePost(id);
  await deleteVideoFiles(videoUrls(p)).catch((e) => console.error("video delete failed", e));
  return { ok: true };
});


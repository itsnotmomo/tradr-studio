import { body, route } from "@/lib/server/api";
import { mutatePlan } from "@/lib/server/store";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const b = await body<{ postId?: string | null }>(req);
  return mutatePlan((await params).id, (d) => {
    if (b.postId !== undefined) d.postId = b.postId || null;
  });
});

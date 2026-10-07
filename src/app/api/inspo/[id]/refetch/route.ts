import { body, route } from "@/lib/server/api";
import { getInspo, mutateInspo, NotFoundError } from "@/lib/server/store";
import { fetchFromInstagram } from "@/lib/server/inspo";

export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<{ username?: string }>(req).catch(() => ({}) as { username?: string });
  const cur = await getInspo(id);
  if (!cur) throw new NotFoundError();
  const username = (b.username || cur.username || "").replace(/^@/, "").trim() || null;
  const fetched = await fetchFromInstagram({ shortcode: cur.shortcode, username });
  return mutateInspo(id, (d) => {
    d.username = username;
    // Keep screenshots if the fetch brought no images.
    const imgs = fetched.images?.length ? fetched.images : d.images;
    Object.assign(d, fetched, { images: imgs });
  });
});

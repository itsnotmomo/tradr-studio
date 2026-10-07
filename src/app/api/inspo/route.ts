import { body, route } from "@/lib/server/api";
import { createInspo, listInspo, mutateInspo, UserError } from "@/lib/server/store";
import { fetchFromInstagram } from "@/lib/server/inspo";
import { parseInstagramUrl } from "@/lib/server/meta/discovery";

export const maxDuration = 120;

export const GET = route(async () => listInspo());

export const POST = route(async (req) => {
  const b = await body<{ url?: string; username?: string; images?: { url: string; w?: number; h?: number }[]; tags?: string[] }>(req);
  const parsed = b.url ? parseInstagramUrl(b.url) : null;
  if (b.url && !parsed) throw new UserError("That doesn't look like an Instagram post link.");
  const username = (b.username || parsed?.username || "").replace(/^@/, "").trim() || null;
  const images = (b.images || []).filter((i) => /\.public\.blob\.vercel-storage\.com\//.test(i.url));

  if (parsed) {
    const existing = (await listInspo()).find((x) => x.shortcode === parsed.shortcode);
    if (existing) return { item: existing, duplicate: true };
  }
  const item = await createInspo({
    url: parsed?.url ?? null, shortcode: parsed?.shortcode ?? null, username, images, source: images.length ? "screenshot" : "api",
    tags: (b.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
  });
  if (!parsed || images.length) return { item };
  const fetched = await fetchFromInstagram(item);
  return { item: await mutateInspo(item.id, (d) => Object.assign(d, fetched)) };
});

import { body, route } from "@/lib/server/api";
import { createInspo, listInspo, UserError } from "@/lib/server/store";
import { parseInstagramUrl } from "@/lib/igurl";

export const GET = route(async () => listInspo());

// Inspo is added by hand: screenshots plus an optional link, @account, notes and tags. Nothing is fetched from Meta.
export const POST = route(async (req) => {
  const b = await body<{ url?: string; username?: string; images?: { url: string; w?: number; h?: number }[]; tags?: string[]; notes?: string; description?: string }>(req);
  const parsed = b.url?.trim() ? parseInstagramUrl(b.url) : null;
  if (b.url?.trim() && !parsed) throw new UserError("That doesn't look like an Instagram post link.");
  const images = (b.images || []).filter((i) => /\.public\.blob\.vercel-storage\.com\//.test(i.url));
  if (!parsed && !images.length) throw new UserError("Add a screenshot or a link.");
  if (parsed) {
    const existing = (await listInspo()).find((x) => x.shortcode === parsed.shortcode);
    if (existing) return { item: existing, duplicate: true };
  }
  const item = await createInspo({
    url: parsed?.url ?? null, shortcode: parsed?.shortcode ?? null,
    username: (b.username || parsed?.username || "").replace(/^@/, "").trim() || null,
    images, notes: String(b.notes || "").slice(0, 5000), description: String(b.description || "").slice(0, 2000),
    tags: [...new Set((b.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))],
  });
  return { item };
});

// Fills preview images and post dates for Inspo items that are missing them, using the public
// post page's link-preview tags (og:image / og:description). Read-only towards Instagram.
// Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/inspo-fill-missing.ts
import sharp from "sharp";
import { put } from "@vercel/blob";
import { listInspo, mutateInspo } from "@/lib/server/store";

const UA = "Mozilla/5.0 (compatible; facebookexternalhit/1.1)";
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const meta = (html: string, prop: string) => html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))?.[1];

async function main() {
  const missing = (await listInspo()).filter((i) => i.url && (!i.images.length || !i.postedAt));
  for (const it of missing) {
    try {
      const html = await (await fetch(it.url!, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) })).text();
      const img = meta(html, "og:image");
      const desc = unescape(meta(html, "og:description") || "");
      const when = desc.match(/ on ([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1];
      let url: string | null = null;
      if (!it.images.length && img) {
        const buf = Buffer.from(await (await fetch(unescape(img), { signal: AbortSignal.timeout(20_000) })).arrayBuffer());
        const jpg = await sharp(buf).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
        url = (await put(`inspo/${it.shortcode}.jpg`, jpg, { access: "public", contentType: "image/jpeg", addRandomSuffix: true })).url;
      }
      await mutateInspo(it.id, (d) => {
        if (url) d.images = [{ url }];
        if (!d.postedAt && when) d.postedAt = new Date(`${when} 12:00 UTC`).toISOString();
      });
      console.log(`${it.username}/${it.shortcode}: image ${url ? "added" : it.images.length ? "had" : "none"}, date ${it.postedAt ? "had" : when || "none"}`);
    } catch (e) {
      console.log(`${it.username}/${it.shortcode}: failed (${(e as Error).message})`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

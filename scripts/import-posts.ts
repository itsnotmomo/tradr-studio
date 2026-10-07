// One-off import of the first three posts from "Tradr Insta Posts/".
// Each language folder holds 1.png, 2.png, 3.png: the same three posts, translated.
// Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/import-posts.ts "<folder>"
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { createPost, listPosts } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import type { Lang, Slide } from "@/lib/types";

const FOLDERS: Record<Lang, string> = { en: "TRADR ENG", es: "TRADR ES", it: "TRADR ITA" };
const TITLES = ["S&P since 1921: you'd also be dead", "The iceberg: what others see", "Risk:reward, 1:1 to 1:10"];

async function slideFrom(file: string): Promise<Slide> {
  // Instagram only accepts JPEG.
  const jpeg = await sharp(await readFile(file)).flatten({ background: "#ffffff" }).toColorspace("srgb").jpeg({ quality: 93, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const id = crypto.randomUUID();
  const blob = await put(`slides/${id}.jpg`, jpeg.data, { access: "public", contentType: "image/jpeg", addRandomSuffix: true });
  return { id, url: blob.url, w: jpeg.info.width, h: jpeg.info.height };
}

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("Pass the folder that contains TRADR ENG, TRADR ES and TRADR ITA");
  const settings = await getSettings();
  const existing = new Set((await listPosts()).map((p) => p.title));
  for (const [i, title] of TITLES.entries()) {
    if (existing.has(title)) {
      console.log(`skip (already imported): ${title}`);
      continue;
    }
    const variants: Record<string, { slides: Slide[] }> = {};
    for (const [k, folder] of Object.entries(FOLDERS)) variants[k] = { slides: [await slideFrom(path.join(root, folder, `${i + 1}.png`))] };
    const p = await createPost({ title, date: null, variants: variants as never }, settings);
    console.log(`imported: ${title} (${p.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

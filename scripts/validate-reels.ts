// Re-measures every stored reel video and cover (reads the files themselves, not the saved sizes)
// and lists anything that isn't 1080 × 1920, plus reels with no cover.
// Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/validate-reels.ts
import { listPosts } from "@/lib/server/store";
import { jpegDims, videoDims } from "@/lib/server/mediainfo";
import { LK, langInfo } from "@/lib/langs";
import { REEL_H, REEL_W } from "@/lib/reel";

async function main() {
  let bad = 0, checked = 0;
  const noCover: string[] = [];
  const reels = (await listPosts()).filter((p) => p.kind === "reel").sort((a, b) => (a.date || "~").localeCompare(b.date || "~"));
  for (const p of reels) {
    for (const k of LK) {
      const v = p.variants[k];
      const label = `${p.date ?? "idea"} ${langInfo(k).code} “${p.title || "Untitled"}”`;
      if (v.video) {
        checked++;
        const d = await videoDims(v.video.url).catch(() => null);
        if (!d || d.w !== REEL_W || d.h !== REEL_H) {
          bad++;
          console.log(`FAIL video ${label}: ${d ? `${d.w} × ${d.h}` : "couldn't be read"}`);
        }
      }
      if (v.cover) {
        const d = await jpegDims(v.cover.url).catch(() => null);
        if (!d || d.w !== REEL_W || d.h !== REEL_H) {
          bad++;
          console.log(`FAIL cover ${label}: ${d ? `${d.w} × ${d.h}` : "couldn't be read"}`);
        }
      } else if (v.video) noCover.push(label);
    }
  }
  console.log(`${checked} videos checked, ${bad} problem${bad === 1 ? "" : "s"}.`);
  if (noCover.length) console.log(`No cover (Instagram uses the first frame):\n  ${noCover.join("\n  ")}`);
  if (bad) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

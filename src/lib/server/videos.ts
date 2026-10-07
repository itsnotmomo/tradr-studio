import "server-only";
import { del } from "@vercel/blob";
import { listPosts, mutatePost } from "./store";
import { LK } from "../langs";
import type { Post } from "../types";

// Reel videos are big (50–200 MB each) and the Hobby Blob store holds 1 GB, so:
// - uploads are refused when the stored videos would go past VIDEO_BUDGET
// - replaced or removed videos are deleted right away
// - a video is deleted 48 h after its version is marked Posted (never before, never if not Posted)

export const VIDEO_BUDGET = 750 * 1024 * 1024;
export const VIDEO_MAX = 600 * 1024 * 1024;
const KEEP_AFTER_POSTED = 48 * 3600_000;

const isVideoUrl = (u: string) => /\.public\.blob\.vercel-storage\.com\/videos\//.test(u);
export const videoUrls = (p: Post) => LK.map((k) => p.variants[k].video?.url).filter((u): u is string => !!u);

export async function storedVideoBytes() {
  return (await listPosts()).reduce((sum, p) => sum + LK.reduce((s, k) => s + (p.variants[k].video?.size || 0), 0), 0);
}

export async function deleteVideoFiles(urls: string[]) {
  const ok = urls.filter(isVideoUrl);
  if (ok.length) await del(ok);
}

/** Runs from the scheduler. Returns how many videos were removed. */
export async function cleanupPostedVideos(now = Date.now()) {
  let removed = 0;
  for (const p of await listPosts()) {
    if (p.kind !== "reel") continue;
    for (const k of LK) {
      const v = p.variants[k];
      if (!v.video || v.status !== "posted" || !v.markedPostedAt || now - v.markedPostedAt < KEEP_AFTER_POSTED) continue;
      let url: string | null = null;
      // Re-check inside the write: only a version that is still Posted loses its video.
      await mutatePost(p.id, (x) => {
        const xv = x.variants[k];
        if (!xv.video || xv.status !== "posted" || !xv.markedPostedAt || now - xv.markedPostedAt < KEEP_AFTER_POSTED) return;
        url = xv.video.url;
        xv.video = null;
        xv.videoRemovedAt = now;
      });
      if (url) {
        await deleteVideoFiles([url]);
        removed++;
      }
    }
  }
  return removed;
}

import "server-only";
import { del } from "@vercel/blob";
import { jpegDims, videoDims } from "./mediainfo";
import { UserError } from "./store";
import type { PostPatch } from "./posts";
import type { Video } from "../types";
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

// ---------- 1080 × 1920 rule ----------

export const REEL_W = 1080, REEL_H = 1920;

export function sizeProblem(kind: "video" | "cover", w: number, h: number) {
  if (w === REEL_W && h === REEL_H) return null;
  const shape = w > h ? "horizontal" : w === h ? "square" : "vertical, but the wrong size";
  const fix = kind === "video" ? "in CapCut set Resolution 1080p, ratio 9:16." : "export the cover at 1080 × 1920.";
  return `This ${kind} is ${w} × ${h} (${shape}). Reels need 1080 × 1920 — ${fix}`;
}

/** Deletes reel video files that never got attached to a reel (e.g. an upload whose page was closed). */
export async function sweepOrphanVideos(now = Date.now()) {
  const { list } = await import("@vercel/blob");
  const used = new Set((await listPosts()).flatMap(videoUrls));
  const stale: string[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: "videos/", cursor, limit: 1000 });
    for (const b of r.blobs) if (!used.has(b.url) && now - new Date(b.uploadedAt).getTime() > 6 * 3600_000) stale.push(b.url);
    cursor = r.cursor;
  } while (cursor);
  await deleteVideoFiles(stale);
  return stale.length;
}

/**
 * Re-checks reel media on the server once uploaded: the stored file itself must be 1080 × 1920.
 * Anything else is deleted and rejected. The measured size replaces what the browser reported.
 */
export async function checkReelMedia(patch: PostPatch) {
  for (const vp of Object.values(patch.variants || {})) {
    if (!vp) continue;
    const video = vp.video as Video | null | undefined;
    if (video?.url) {
      let dims: { w: number; h: number } | null = null;
      try {
        dims = await videoDims(video.url);
      } catch {
        dims = null;
      }
      const problem = dims ? sizeProblem("video", dims.w, dims.h) : "This video's size couldn't be read. Export it again from CapCut as MP4, 1080p, 9:16.";
      if (problem) {
        await del(video.url).catch(() => {});
        if (vp.frame && typeof vp.frame === "object" && "url" in vp.frame) await del((vp.frame as { url: string }).url).catch(() => {});
        throw new UserError(problem);
      }
      video.w = dims!.w;
      video.h = dims!.h;
    }
    const cover = vp.cover as { url?: string } | null | undefined;
    if (cover?.url) {
      const dims = await jpegDims(cover.url).catch(() => null);
      const problem = dims ? sizeProblem("cover", dims.w, dims.h) : "This cover's size couldn't be read. Use a JPG or PNG at 1080 × 1920.";
      if (problem) {
        await del(cover.url).catch(() => {});
        throw new UserError(problem);
      }
    }
  }
}

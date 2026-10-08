import type { Variant } from "./types";

export const REEL_W = 1080, REEL_H = 1920;

/**
 * Problems with a reel version's stored media (sizes were measured on the server when attached).
 * Re-checked everywhere, because a video attached before the 1080 × 1920 rule existed was never refused.
 */
export function reelMediaProblems(v: Pick<Variant, "video" | "cover">) {
  const out: string[] = [];
  if (v.video && (v.video.w !== REEL_W || v.video.h !== REEL_H)) out.push(`The video is ${v.video.w} × ${v.video.h}. Reels need 1080 × 1920. Replace it with a 1080p, 9:16 export.`);
  if (v.cover && (v.cover.w !== REEL_W || v.cover.h !== REEL_H)) out.push(`The cover is ${v.cover.w} × ${v.cover.h}. Covers need 1080 × 1920.`);
  return out;
}

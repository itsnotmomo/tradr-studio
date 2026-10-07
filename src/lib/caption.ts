import type { Variant } from "./types";

type CaptionParts = Pick<Variant, "comment" | "tradr" | "hashtags">;

/** The three caption parts, joined the way they're posted. */
export const buildCaption = (v: CaptionParts) =>
  [v.comment, v.tradr, v.hashtags].map((s) => (s || "").trim()).filter(Boolean).join("\n\n");

export const hashtagCount = (t: string) => (t.match(/#[\p{L}\p{N}_]+/gu) || []).length;

/** Instagram counts characters, not bytes; emoji count as one. */
export const charCount = (t: string) => [...t].length;

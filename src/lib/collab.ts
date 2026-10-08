import type { Lang, Post } from "./types";

/** The collaborator added when scheduling in Instagram. */
export const COLLAB_HANDLE = "range.fx";

/** On by default for English Afternoon posts only. */
export const collabDefault = (p: Pick<Post, "slot" | "kind">, k: Lang) => k === "en" && p.kind === "post" && p.slot === "afternoon";

/** The collaborator for this version, or null. A per-version override beats the default. */
export const collabOf = (p: Post, k: Lang) => ((p.variants[k].collab ?? collabDefault(p, k)) ? COLLAB_HANDLE : null);

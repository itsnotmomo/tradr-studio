import { AUTO_PUBLISH } from "./features";
import { publishAt } from "./slots";
import type { DisplayStatus, Lang, Post, PostStatus, Settings, Variant } from "./types";

/** Auto-publishing status (only used while AUTO_PUBLISH is on). */
export const displayStatus = (v: Variant): DisplayStatus =>
  v.state === "idle" ? (v.ready ? "ready" : "draft") : v.state;

/** The slot time has passed and it's neither scheduled in Instagram nor posted. */
export function isMissed(p: Post, k: Lang, s: Settings | undefined, now = Date.now()) {
  const st = p.variants[k].status;
  return !!s && !!p.date && (st === "draft" || st === "ready") && publishAt(s, k, p.date, p.slot) <= now;
}

/** What to show for one language of a post. */
export function statusOf(p: Post, k: Lang, s: Settings | undefined, now = Date.now()): DisplayStatus {
  if (AUTO_PUBLISH) return displayStatus(p.variants[k]);
  return isMissed(p, k, s, now) ? "missed" : p.variants[k].status;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  publishing: "Publishing",
  posted: "Posted",
  failed: "Failed",
  missed: "Missed",
};

export const MANUAL_STATUSES: { k: PostStatus; label: string; long: string }[] = [
  { k: "draft", label: "Draft", long: "Draft" },
  { k: "ready", label: "Ready", long: "Ready" },
  { k: "scheduled", label: "Scheduled", long: "Scheduled in Instagram" },
  { k: "posted", label: "Posted", long: "Posted" },
];

/** Done for this account: nothing left to do in the Instagram app. */
export const isDone = (st: PostStatus) => st === "scheduled" || st === "posted";

/** Variant content can't change once it's on its way to (or on) Instagram via the API. */
export const isLocked = (v: Variant) => v.state === "publishing" || v.state === "posted";

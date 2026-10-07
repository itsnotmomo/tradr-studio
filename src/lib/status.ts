import type { DisplayStatus, Variant } from "./types";

export const displayStatus = (v: Variant): DisplayStatus =>
  v.state === "idle" ? (v.ready ? "ready" : "draft") : v.state;

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  publishing: "Publishing",
  posted: "Posted",
  failed: "Failed",
};

/** Variant content can't change once it's on its way to (or on) Instagram. */
export const isLocked = (v: Variant) => v.state === "publishing" || v.state === "posted";

// News desk: drafts made locally by the "make news posts" run, reviewed and posted by hand from Tradr Media.

export type NewsStatus = "draft" | "changes" | "approved" | "rejected" | "posted";

export type NewsSlide = { url: string; kind: "image" | "video"; w: number; h: number; poster?: string | null; duration?: number | null };

export type NewsSource = { label: string; url: string };
export type NewsPhoto = { what: string; url: string; page?: string; credit: string; license?: string };

export type NewsDraft = {
  id: string;
  rev: number;
  status: NewsStatus;
  /** Internal name, e.g. "Huang resigns" */
  title: string;
  tag: string;
  /** Slides without the fixed end slide (that one comes from settings, so a new choice applies everywhere). */
  slides: NewsSlide[];
  caption: string;
  x: string;
  sources: NewsSource[];
  photos: NewsPhoto[];
  confirmed: string[];
  reported: string[];
  /** The owner's latest change request; cleared when the draft is redone. */
  changeNote: string;
  /** Every note and redo, oldest first. */
  history: { at: number; what: string }[];
  /** How many times it has been redone. */
  version: number;
  suggestionId: string | null;
  /** The day's collab post (one per day): tag this account as collaborator when posting. */
  collab?: { handle: string; day: string } | null;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  postedAt: number | null;
  /** One-button posting (16 Nov 2026): set by the Post button, worked by the poster on the Mac (scripts/news/poster.ts). */
  post?: NewsPost | null;
  /** The run's suggested Instagram go-live time (ms) and why; the Post picker offers it first. */
  bestTime?: { at: number; why: string } | null;
  /** Made by the scheduled news-scout run (20 Nov 2026), not by hand. */
  scout?: boolean;
  /** Hand edits in Tradr Media (caption, X text, a swapped slide): before/after, read by the scout as taste feedback. */
  edits?: NewsEdit[];
  /** "reel" (24 Nov 2026): one 9:16 1080x1920 video with its own sound, posted as an Instagram Reel (no end slide);
   *  its tweet carries the same video. Unset = a carousel. */
  kind?: "reel";
  /** Instagram only (24 Nov 2026): the X part is off, so this draft never goes to X and isn't on the X board. */
  xOff?: boolean;
};

export const isReel = (d: Pick<NewsDraft, "kind">) => d.kind === "reel";
/** Whether a draft belongs on a platform's board (an X-off draft is Instagram only). */
export const onPlatform = (d: Pick<NewsDraft, "xOff">, p: Platform) => !(p === "x" && d.xOff);

export type NewsEdit = { at: number; field: "caption" | "x" | "slide"; slide?: number; before: string; after: string };

// ---------- Per platform (20 Nov 2026): every draft goes to both, each platform has its own state ----------

export type Platform = "ig" | "x";
export type PlatformState = "review" | "changes" | "ready" | "failed" | "posting" | "scheduled" | "posted" | "rejected";
export type BoardTab = "review" | "scheduled" | "posted" | "pitches";

/** Where a draft stands on one platform. Instagram is scheduled at a time (Instagram's own scheduler); the tweet goes out at once. */
export function platformState(d: NewsDraft, p: Platform, now: number): PlatformState {
  if (d.status === "rejected") return "rejected";
  const post = d.post;
  if (p === "ig") {
    if (post?.igScheduledAt) return post.igAt > now ? "scheduled" : "posted";
    if (post && (post.state === "queued" || post.state === "running")) return "posting";
    if (post?.state === "failed") return "failed";
  } else {
    if (post?.tweetUrl) return "posted";
    if (post && (post.state === "queued" || post.state === "running")) return "posting";
    if (post?.state === "failed") return "failed";
  }
  if (d.status === "posted") return "posted"; // marked posted by hand (before the Post button)
  if (d.status === "changes") return "changes";
  if (d.status === "approved") return "ready";
  return "review";
}

export const tabOf = (s: PlatformState): Exclude<BoardTab, "pitches"> =>
  s === "scheduled" || s === "posting" ? "scheduled" : s === "posted" ? "posted" : "review";

export const PLATFORM_STATE_LABEL: Record<PlatformState, string> = {
  review: "To review", changes: "Changes asked", ready: "Approved · ready to post", failed: "Posting failed",
  posting: "Posting…", scheduled: "Scheduled", posted: "Posted", rejected: "Rejected",
};

/** Instagram's web scheduler takes posts from 20 minutes ahead up to 29 days ahead (its calendar greys out day 30;
 *  tested 17 Nov 2026, though Meta's help says 75 days). The picker's earliest choice is 30 minutes
 *  (the poster needs a minute or two to pick it up and fill the form); the server refuses anything under 25. */
export const IG_MIN_LEAD_MS = 25 * 60e3;
export const IG_MAX_LEAD_MS = 29 * 24 * 3600e3;

/** queued → running → done | failed. Instagram is scheduled at the time picked on Post (default 24 h) in Instagram's own scheduler (so music can be
 *  added from the phone); the tweet goes out at once. Each half is recorded as it finishes, so a retry skips it. */
export type NewsPost = {
  state: "queued" | "running" | "done" | "failed";
  requestedAt: number;
  /** When the Instagram post goes live (ms). */
  igAt: number;
  igScheduledAt: number | null;
  tweetUrl: string | null;
  error: string | null;
  updatedAt: number;
};

export type NewsSuggestion = {
  id: string;
  rev: number;
  text: string;
  url: string | null;
  /** pitch = a one-line idea from the news-scout run, waiting for "Make this one" (→ queued). */
  status: "queued" | "done" | "skipped" | "pitch";
  /** Started as a pitch: "chosen" (Make this one) or "dismissed" (×). The run learns from both. */
  pitch?: "chosen" | "dismissed";
  /** Why it was skipped, or the draft it became. */
  note: string;
  draftId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StyleRef = { id: string; url: string; w: number; h: number; note: string; addedAt: number };

export type EndOption = { id: string; line: string; sub: string; url: string };

export type NewsDesk = {
  /** Style references the owner dropped in. */
  refs: StyleRef[];
  /** The written style guide every draft follows (markdown). */
  guide: string;
  guideUpdatedAt: number | null;
  /** Ref ids the current guide already accounts for. */
  guideRefIds: string[];
  /** The last-slide wording options, and the one chosen (null = not chosen yet, the first is used). */
  endOptions: EndOption[];
  endChoice: string | null;
  lastRunAt: number | null;
  lastRunSummary: string;
  /** The taste file (what Mohamed approves, rejects and changes), kept by the news-scout run; a copy of .news/taste.md. */
  taste?: string;
  tasteUpdatedAt?: number | null;
  /** Review events up to this time are already learned into the taste file. */
  tasteSeenAt?: number | null;
  /** The last weekly "what I learned" push. */
  weeklyAt?: number | null;
};

export const NEWS_DESK_DEFAULTS: NewsDesk = {
  refs: [], guide: "", guideUpdatedAt: null, guideRefIds: [], endOptions: [], endChoice: null, lastRunAt: null, lastRunSummary: "",
};

export const endSlideOf = (d: NewsDesk) => d.endOptions.find((o) => o.id === d.endChoice) ?? d.endOptions[0] ?? null;

export const NEWS_STATUS_LABEL: Record<NewsStatus, string> = {
  draft: "Draft", changes: "Changes asked", approved: "Approved", rejected: "Rejected", posted: "Posted",
};

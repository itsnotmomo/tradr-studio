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
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  postedAt: number | null;
};

export type NewsSuggestion = {
  id: string;
  rev: number;
  text: string;
  url: string | null;
  status: "queued" | "done" | "skipped";
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
};

export const NEWS_DESK_DEFAULTS: NewsDesk = {
  refs: [], guide: "", guideUpdatedAt: null, guideRefIds: [], endOptions: [], endChoice: null, lastRunAt: null, lastRunSummary: "",
};

export const endSlideOf = (d: NewsDesk) => d.endOptions.find((o) => o.id === d.endChoice) ?? d.endOptions[0] ?? null;

export const NEWS_STATUS_LABEL: Record<NewsStatus, string> = {
  draft: "Draft", changes: "Changes asked", approved: "Approved", rejected: "Rejected", posted: "Posted",
};

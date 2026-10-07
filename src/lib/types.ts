export type Lang = "en" | "es" | "it";
export type Slot = "morning" | "afternoon";

export type Slide = { id: string; url: string; w: number; h: number };

/** idle = not queued (draft or ready, see `ready`). */
export type VariantState = "idle" | "scheduled" | "publishing" | "posted" | "failed";
export type DisplayStatus = "draft" | "ready" | "scheduled" | "publishing" | "posted" | "failed";

export type PublishError = {
  message: string;
  detail?: string;
  code?: string;
  stage?: string;
  at: number;
};

export type Metrics = {
  likes: number | null;
  comments: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  views: number | null;
  fetchedAt: number;
};

export type Variant = {
  comment: string;
  tradr: string;
  hashtags: string;
  slides: Slide[];
  ready: boolean;
  state: VariantState;
  /** When the variant is queued to publish (ms). Resolved from the post's date + slot in this account's zone. */
  scheduledAt: number | null;
  /** Queued by "Post now" / retry rather than by the slot. */
  postNow?: boolean;
  /** Set when an automatic retry is pending. */
  nextAttemptAt: number | null;
  attempts: number;
  attemptStartedAt: number | null;
  stage: string | null;
  error: PublishError | null;
  log: { at: number; msg: string }[];
  igMediaId: string | null;
  permalink: string | null;
  publishedAt: number | null;
  metrics: Metrics | null;
  metricsError: string | null;
};

export type Post = {
  id: string;
  title: string;
  notes: string;
  /** YYYY-MM-DD (the same calendar day in each account's zone), or null for an idea. */
  date: string | null;
  slot: Slot;
  inspoId: string | null;
  createdAt: number;
  updatedAt: number;
  variants: Record<Lang, Variant>;
  rev: number;
};

export type LangSettings = {
  tradrSlide: Slide | null;
  tradr: string;
  hashtags: string;
};

export type LangSchedule = { zone: string; morning: string; afternoon: string };

export type Settings = {
  /** Your own zone, for "today" when posting from Ideas. */
  timezone: string;
  langs: Record<Lang, LangSettings>;
  /** Per account: its time zone and the local HH:MM of each slot. */
  schedule: Record<Lang, LangSchedule>;
};

export type Account = {
  igUserId: string;
  username: string;
  name: string;
  pictureUrl: string | null;
  followers: number | null;
  /** Which Meta API host this token belongs to. */
  host: "graph.instagram.com" | "graph.facebook.com";
  tokenEnc: string;
  tokenExpiresAt: number | null;
  connectedAt: number;
  refreshedAt: number | null;
  lastError: string | null;
};

/** Account as sent to the browser (no token). */
export type AccountPublic = Omit<Account, "tokenEnc">;

export type InspoStatus = "todo" | "skip" | "done";

export type Inspo = {
  id: string;
  url: string | null;
  shortcode: string | null;
  username: string | null;
  /** What the post is (from the archive, or your own words). */
  description: string;
  format: string | null;
  likes: number | null;
  comments: number | null;
  images: { url: string; w?: number; h?: number }[];
  status: InspoStatus;
  tags: string[];
  notes: string;
  postId: string | null;
  createdAt: number;
  updatedAt: number;
  rev: number;
};

export type SchedulerHealth = { lastTickAt: number | null; lastResult: string | null };

/** A planned post idea with its slide text per language and reference posts. */
export type PlanItem = {
  id: string;
  number: number;
  /** e.g. "Week 1" */
  group: string;
  type: string;
  texts: Record<Lang, string>;
  refs: { inspoId: string; note: string }[];
  postId: string | null;
  createdAt: number;
  updatedAt: number;
  rev: number;
};

/** Readable notes kept with the inspo archive. */
export type InspoNotes = { intro: string; planIntro: string; accounts: { tag: string; title: string; text: string }[] };

export type Lang = "en" | "es" | "it";

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
  /** When the variant is queued to publish (ms). Derived from the post's date + time. */
  scheduledAt: number | null;
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
  /** YYYY-MM-DD in the planner's time zone, or null for an idea. */
  date: string | null;
  /** HH:MM */
  time: string;
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

export type Settings = {
  timezone: string;
  defaultTime: string;
  langs: Record<Lang, LangSettings>;
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
  caption: string;
  likes: number | null;
  comments: number | null;
  mediaType: string | null;
  images: { url: string; w?: number; h?: number }[];
  postedAt: string | null;
  source: "api" | "screenshot";
  fetchError: string | null;
  status: InspoStatus;
  tags: string[];
  notes: string;
  postId: string | null;
  createdAt: number;
  updatedAt: number;
  rev: number;
};

export type SchedulerHealth = { lastTickAt: number | null; lastResult: string | null };

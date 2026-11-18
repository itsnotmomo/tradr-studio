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
  /** Tradr News (18 Nov 2026): the article on tradr.me/news built from this carousel. */
  tradrNews?: TradrNewsState | null;
};

/** Tradr News categories (the app's news_category_valid). "Breaking" is a flag on top of one of these. */
export const TRADR_NEWS_CATEGORIES = [
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Commodities" },
  { id: "economy", label: "Economy" },
  { id: "ai", label: "AI" },
  { id: "business", label: "Business" },
] as const;
export type TradrNewsCategory = (typeof TRADR_NEWS_CATEGORIES)[number]["id"];

export type TradrNewsChoice = { category: TradrNewsCategory; breaking: boolean };

export type TradrNewsState = {
  state: "published" | "hidden" | "failed";
  category: TradrNewsCategory;
  breaking: boolean;
  slug: string | null;
  url: string | null;
  error: string | null;
  publishedAt: number | null;
  updatedAt: number;
};

/** A first guess from the story's words; the owner can change it before publishing. */
export function guessTradrNewsCategory(text: string): TradrNewsCategory {
  const t = text.toLowerCase();
  if (/\b(bitcoin|btc|ethereum|eth|crypto|solana|xrp|stablecoin|coinbase|binance|memecoin)\b/.test(t)) return "crypto";
  if (/\b(gold|silver|oil|crude|brent|copper|wheat|natural gas)\b/.test(t)) return "commodities";
  if (/\b(dollar|euro|yen|pound|forex|fx|eur\/usd|currency|currencies)\b/.test(t)) return "forex";
  if (/\b(fed|ecb|boe|inflation|cpi|rates?|recession|gdp|jobs report|payrolls|tariffs?|treasury)\b/.test(t)) return "economy";
  if (/\b(ai|openai|chatgpt|anthropic|claude|gemini|llm|artificial intelligence)\b/.test(t)) return "ai";
  if (/\b(stock|stocks|shares|ipo|nasdaq|s&p|dow|earnings|nvidia|tesla|apple|microsoft)\b/.test(t)) return "stocks";
  return "business";
}

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

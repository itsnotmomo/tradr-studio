import "server-only";
import type { NewsDraft, TradrNewsChoice, TradrNewsState } from "../news";

// Tradr News (18 Nov 2026): a news carousel becomes an article on tradr.me/news.
// Studio sends the carousel (rendered slides), the story text from the draft's spec,
// the caption and the sources to Tradr's `news-publish` edge function. Tradr copies the
// images into its own storage, so the article never depends on Studio's files.
//
// Env (Vercel): TRADR_NEWS_URL (the function URL), TRADR_NEWS_SECRET (its NEWS_PUBLISH_SECRET),
// TRADR_NEWS_SITE (where articles live, e.g. https://staging.tradr.me while it is on staging).

type SpecSlide = {
  type?: string;
  headline?: string;
  tag?: string;
  text?: string;
  story?: { title?: string; body?: string };
  quote?: { text?: string; who?: string; role?: string };
};

export function tradrNewsConfigured() {
  return !!process.env.TRADR_NEWS_URL && !!process.env.TRADR_NEWS_SECRET;
}

/** The article Tradr builds from this draft. */
export function articleFromDraft(d: NewsDraft, choice: TradrNewsChoice) {
  const spec = (d as unknown as { spec?: { slides?: SpecSlide[] } }).spec;
  const specSlides = spec?.slides ?? [];
  const hook = specSlides[0];
  const sections = specSlides.slice(1).map((s, i) => {
    const slide = i + 1;
    if (s.story) return { title: s.story.title ?? "", body: s.story.body ?? "", slide };
    if (s.quote?.text) return { title: s.text ?? "", body: `“${s.quote.text}” — ${[s.quote.who, s.quote.role].filter(Boolean).join(", ")}`, slide };
    return { title: "", body: s.text ?? "", slide };
  }).filter((s) => (s.title || s.body).trim());
  return {
    studioId: d.id,
    headline: (hook?.headline || d.title).replace(/\n/g, " "),
    category: choice.category,
    breaking: choice.breaking,
    slides: d.slides.map((s) => ({ url: s.url, kind: s.kind, w: s.w, h: s.h, poster: s.poster ?? null })),
    sections,
    caption: d.caption,
    sources: d.sources,
  };
}

async function call(body: unknown): Promise<{ ok?: boolean; slug?: string | null; error?: string }> {
  const res = await fetch(process.env.TRADR_NEWS_URL!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-news-secret": process.env.TRADR_NEWS_SECRET! },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({ error: `Tradr answered ${res.status}` }));
  if (!res.ok) throw new Error(out.error || `Tradr answered ${res.status}`);
  return out;
}

const site = () => (process.env.TRADR_NEWS_SITE || "https://tradr.me").replace(/\/+$/, "");

/** Publishes (or updates) the article. Never throws: the result is the state to record on the draft. */
export async function publishToTradrNews(d: NewsDraft, choice: TradrNewsChoice): Promise<TradrNewsState> {
  const now = Date.now();
  const base = { category: choice.category, breaking: choice.breaking, updatedAt: now };
  if (!tradrNewsConfigured()) return { ...base, state: "failed", slug: null, url: null, error: "Tradr News isn't set up here (TRADR_NEWS_URL / TRADR_NEWS_SECRET).", publishedAt: d.tradrNews?.publishedAt ?? null };
  try {
    const out = await call({ action: "publish", article: articleFromDraft(d, choice) });
    const slug = out.slug ?? null;
    return { ...base, state: "published", slug, url: slug ? `${site()}/news/${slug}` : null, error: null, publishedAt: d.tradrNews?.publishedAt ?? now };
  } catch (e) {
    return { ...base, state: "failed", slug: d.tradrNews?.slug ?? null, url: d.tradrNews?.url ?? null, error: (e as Error).message, publishedAt: d.tradrNews?.publishedAt ?? null };
  }
}

export async function unpublishFromTradrNews(d: NewsDraft): Promise<TradrNewsState> {
  const prev = d.tradrNews!;
  try {
    await call({ action: "unpublish", studioId: d.id });
    return { ...prev, state: "hidden", error: null, updatedAt: Date.now() };
  } catch (e) {
    return { ...prev, error: (e as Error).message, updatedAt: Date.now() };
  }
}

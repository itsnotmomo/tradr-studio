import "server-only";
import { getPost, mutatePost } from "./store";
import { getConnection, getSettings } from "./settings";
import { decrypt } from "./secrets";
import { describeGraphError, GraphError } from "./meta/graph";
import { findPublished, mediaInsights, publishCarousel, publishingQuota } from "./meta/publish";
import { preflight } from "../preflight";
import { buildCaption } from "../caption";
import { langInfo } from "../langs";
import { publishAt } from "../slots";
import type { Lang, Post, Variant } from "../types";

const MAX_ATTEMPTS = 3;
const log = (v: Variant, msg: string) => {
  v.log = [...v.log, { at: Date.now(), msg }].slice(-30);
};

export type PublishOutcome = { lang: Lang; postId: string; result: "posted" | "failed" | "retrying" | "skipped"; message?: string };

/**
 * Publishes one language version. Safe to call from several places at once:
 * only the caller that flips the state from "scheduled" to "publishing" proceeds.
 */
export async function publishVariant(postId: string, k: Lang): Promise<PublishOutcome> {
  const now = Date.now();
  let claimed = false;
  let post: Post;
  const settings0 = await getSettings();
  try {
    post = await mutatePost(postId, (p) => {
      const v = p.variants[k];
      if (v.state !== "scheduled") return;
      // Slot posts: resolve the real time again now, in case slot times or the day changed since scheduling.
      if (!v.postNow && !v.nextAttemptAt && p.date) {
        const at = publishAt(settings0, k, p.date, p.slot);
        if (Math.abs(at - (v.scheduledAt ?? 0)) > 30_000) v.scheduledAt = at;
      }
      const due = v.nextAttemptAt ?? v.scheduledAt ?? Infinity;
      if (due > now + 5000) return;
      v.state = "publishing";
      v.attempts += 1;
      v.attemptStartedAt = now;
      v.stage = "starting";
      log(v, `Attempt ${v.attempts} started`);
      claimed = true;
    });
  } catch (e) {
    return { lang: k, postId, result: "skipped", message: (e as Error).message };
  }
  if (!claimed) return { lang: k, postId, result: "skipped" };

  const v = post.variants[k];
  const settings = settings0;
  const conn = await getConnection();
  const acct = conn.accounts[k];
  const ls = settings.langs[k];

  const fail = async (err: { message: string; detail?: string; code?: string }, transient: boolean): Promise<PublishOutcome> => {
    let result: PublishOutcome["result"] = "failed";
    await mutatePost(postId, (p) => {
      const x = p.variants[k];
      if (x.state !== "publishing") return;
      const retry = transient && x.attempts < MAX_ATTEMPTS;
      x.error = { ...err, stage: x.stage || undefined, at: Date.now() };
      if (retry) {
        x.state = "scheduled";
        x.nextAttemptAt = Date.now() + 2 * 60_000 * x.attempts;
        log(x, `Failed (${err.message}). Retrying automatically.`);
        result = "retrying";
      } else {
        x.state = "failed";
        x.nextAttemptAt = null;
        x.postNow = false;
        log(x, `Failed: ${err.message}`);
      }
    });
    return { lang: k, postId, result, message: err.message };
  };

  const { problems } = preflight(k, v, ls, !!acct);
  if (problems.length) return fail({ message: problems.join(" ") }, false);

  const token = decrypt(acct!.tokenEnc);
  const caption = buildCaption(v);
  const stage = async (s: string) => {
    await mutatePost(postId, (p) => {
      p.variants[k].stage = s;
    });
  };

  try {
    const quota = await publishingQuota(acct!.igUserId, token).catch(() => null);
    if (quota?.total && quota.used >= quota.total) {
      return fail({ message: `Instagram's limit of ${quota.total} posts per 24 hours is used up for ${langInfo(k).handle}.` }, true);
    }
    const urls = [...v.slides, ls.tradrSlide!].map((s) => s.url);
    const { mediaId, permalink } = await publishCarousel({ igUserId: acct!.igUserId, token, imageUrls: urls, caption, stage });
    await markPosted(postId, k, mediaId, permalink);
    return { lang: k, postId, result: "posted" };
  } catch (e) {
    const d = describeGraphError(e);
    const ge = e instanceof GraphError ? e : null;
    // If media_publish itself failed ambiguously, the post may be live. Check before retrying.
    const cur = await getPost(postId);
    if (cur?.variants[k].stage === "publishing" && (!ge || ge.transient)) {
      try {
        const found = await findPublished(acct!.igUserId, token, caption, cur.variants[k].attemptStartedAt || now);
        if (found) {
          await markPosted(postId, k, found.id, found.permalink || null);
          return { lang: k, postId, result: "posted" };
        }
      } catch {
        /* fall through to failure */
      }
    }
    if (ge?.authProblem) d.message = `${d.message} Reconnect the account in Settings.`;
    return fail(d, !!ge?.transient);
  }
}

async function markPosted(postId: string, k: Lang, mediaId: string, permalink: string | null) {
  await mutatePost(postId, (p) => {
    const v = p.variants[k];
    v.state = "posted";
    v.postNow = false;
    v.igMediaId = mediaId;
    v.permalink = permalink;
    v.publishedAt = Date.now();
    v.stage = null;
    v.error = null;
    v.nextAttemptAt = null;
    log(v, "Posted to Instagram");
  });
}

/** A publish attempt that never finished (e.g. the function was killed). */
export async function recoverStuck(postId: string, k: Lang) {
  const post = await getPost(postId);
  const v = post?.variants[k];
  if (!post || !v || v.state !== "publishing") return;
  const conn = await getConnection();
  const acct = conn.accounts[k];
  // Before the final publish call nothing can be live; after it, ask Instagram.
  let message = "Publishing was interrupted before the final step, so nothing went live. Retry when ready.";
  if (v.stage === "publishing") {
    message = "Publishing was interrupted during the final step and Instagram couldn't be checked. Look at the account before retrying.";
    if (acct) {
      try {
        const found = await findPublished(acct.igUserId, decrypt(acct.tokenEnc), buildCaption(v), v.attemptStartedAt || 0);
        if (found) return markPosted(postId, k, found.id, found.permalink || null);
        message = "Publishing was interrupted during the final step. Checked Instagram: it isn't live. Retry when ready.";
      } catch {
        /* keep the cautious message */
      }
    }
  }
  await mutatePost(postId, (p) => {
    const x = p.variants[k];
    if (x.state !== "publishing") return;
    x.state = "failed";
    x.error = { message, stage: x.stage || undefined, at: Date.now() };
    log(x, "Interrupted");
  });
}

// ---------- Numbers ----------

/** How often to refresh a post's numbers, by age. */
export function metricsDue(v: Variant, now = Date.now()) {
  if (v.state !== "posted" || !v.igMediaId || !v.publishedAt) return false;
  const age = now - v.publishedAt;
  if (age > 60 * 864e5) return false;
  const last = v.metrics?.fetchedAt ?? 0;
  const every = age < 864e5 ? 60 * 60_000 : age < 7 * 864e5 ? 6 * 60 * 60_000 : 24 * 60 * 60_000;
  return now - last >= every;
}

export async function refreshMetrics(postId: string, k: Lang) {
  const post = await getPost(postId);
  const v = post?.variants[k];
  if (!v?.igMediaId) return;
  const conn = await getConnection();
  const acct = conn.accounts[k];
  if (!acct) return;
  try {
    const m = await mediaInsights(v.igMediaId, decrypt(acct.tokenEnc));
    await mutatePost(postId, (p) => {
      p.variants[k].metrics = {
        likes: m.likes, comments: m.comments, reach: m.reach, saved: m.saved, shares: m.shares, views: m.views, fetchedAt: Date.now(),
      };
      p.variants[k].metricsError = null;
    });
  } catch (e) {
    await mutatePost(postId, (p) => {
      p.variants[k].metricsError = describeGraphError(e).message;
      if (p.variants[k].metrics) p.variants[k].metrics!.fetchedAt = Date.now();
      else p.variants[k].metrics = { likes: null, comments: null, reach: null, saved: null, shares: null, views: null, fetchedAt: Date.now() };
    });
  }
}

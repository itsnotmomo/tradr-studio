import "server-only";
import { graph, GraphError } from "./graph";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Status = { status_code?: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED"; status?: string };

async function waitFinished(ids: string[], token: string, timeoutMs = 90_000) {
  const start = Date.now();
  const pending = new Set(ids);
  while (pending.size) {
    for (const id of [...pending]) {
      const s = await graph<Status>(id, { token, params: { fields: "status_code,status" } });
      if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") pending.delete(id);
      else if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
        throw new GraphError(`Instagram couldn't process an image (${s.status_code}${s.status ? `: ${s.status}` : ""}).`, { status: 400 });
      }
    }
    if (!pending.size) break;
    if (Date.now() - start > timeoutMs) throw new GraphError("Instagram took too long to process the images.", { status: 0, transient: true });
    await sleep(2500);
  }
}

export async function publishingQuota(igUserId: string, token: string) {
  const r = await graph<{ data: { quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }[] }>(
    `${igUserId}/content_publishing_limit`, { token, params: { fields: "config,quota_usage" } },
  );
  const d = r.data?.[0] || {};
  return { used: d.quota_usage ?? 0, total: d.config?.quota_total ?? null };
}

/**
 * Carousel publishing:
 *   1. one container per image (is_carousel_item)
 *   2. wait until every container is FINISHED
 *   3. carousel container with children + caption, wait for FINISHED
 *   4. media_publish
 * `stage` is called before each step so a crash can be diagnosed and reconciled.
 */
export async function publishCarousel(opts: {
  igUserId: string; token: string; imageUrls: string[]; caption: string;
  stage: (s: string) => Promise<void>;
}) {
  const { igUserId, token, imageUrls, caption, stage } = opts;
  await stage("uploading-slides");
  const children: string[] = [];
  for (const url of imageUrls) {
    const r = await graph<{ id: string }>(`${igUserId}/media`, { token, method: "POST", params: { image_url: url, is_carousel_item: true } });
    children.push(r.id);
  }
  await stage("processing-slides");
  await waitFinished(children, token);

  await stage("creating-carousel");
  const c = await graph<{ id: string }>(`${igUserId}/media`, {
    token, method: "POST", params: { media_type: "CAROUSEL", children: children.join(","), caption },
  });
  await waitFinished([c.id], token);

  await stage("publishing");
  const pub = await graph<{ id: string }>(`${igUserId}/media_publish`, { token, method: "POST", params: { creation_id: c.id }, timeoutMs: 60_000 });

  let permalink: string | null = null;
  try {
    permalink = (await graph<{ permalink?: string }>(pub.id, { token, params: { fields: "permalink" } })).permalink || null;
  } catch {
    /* not critical */
  }
  return { mediaId: pub.id, permalink };
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** After an interrupted attempt: did the post actually go out? */
export async function findPublished(igUserId: string, token: string, caption: string, since: number) {
  const r = await graph<{ data: { id: string; caption?: string; timestamp: string; permalink?: string }[] }>(`${igUserId}/media`, {
    token, params: { fields: "id,caption,timestamp,permalink", limit: 10 },
  });
  return r.data.find((m) => new Date(m.timestamp).getTime() >= since - 120_000 && norm(m.caption || "") === norm(caption)) || null;
}

export async function mediaInsights(mediaId: string, token: string) {
  const out = { likes: null, comments: null, reach: null, saved: null, shares: null, views: null } as Record<string, number | null>;
  const metrics = ["views", "reach", "likes", "comments", "saved", "shares"];
  type Row = { name: string; values?: { value: number }[]; total_value?: { value: number } };
  const read = (rows: Row[]) => {
    for (const row of rows) out[row.name] = row.total_value?.value ?? row.values?.[0]?.value ?? null;
  };
  try {
    read((await graph<{ data: Row[] }>(`${mediaId}/insights`, { token, params: { metric: metrics.join(",") } })).data);
  } catch (e) {
    // One unsupported metric fails the whole request; fall back to asking one by one.
    if (e instanceof GraphError && e.authProblem) throw e;
    for (const m of metrics) {
      try {
        read((await graph<{ data: Row[] }>(`${mediaId}/insights`, { token, params: { metric: m } })).data);
      } catch {
        /* leave null */
      }
    }
  }
  if (out.likes === null || out.comments === null) {
    try {
      const f = await graph<{ like_count?: number; comments_count?: number }>(mediaId, { token, params: { fields: "like_count,comments_count" } });
      out.likes ??= f.like_count ?? null;
      out.comments ??= f.comments_count ?? null;
    } catch {
      /* ignore */
    }
  }
  return out;
}

export async function accountProfile(igUserId: string, token: string) {
  return graph<{ username: string; name?: string; profile_picture_url?: string; followers_count?: number }>(igUserId, {
    token, params: { fields: "username,name,profile_picture_url,followers_count" },
  });
}

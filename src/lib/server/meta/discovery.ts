import "server-only";
import { graph, GraphError } from "./graph";

export type DiscoveredMedia = {
  id: string; shortcode?: string; permalink?: string; caption?: string; media_type?: string; media_url?: string;
  thumbnail_url?: string; timestamp?: string; like_count?: number; comments_count?: number;
  children?: { data: { media_url?: string; media_type?: string; thumbnail_url?: string }[] };
};

const MEDIA_FIELDS = "id,shortcode,permalink,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count";

/**
 * Business Discovery can't look a post up by its link: it lists an account's
 * posts, so we page through the account until the shortcode turns up.
 */
export async function findPostByShortcode(myIgUserId: string, token: string, username: string, shortcode: string, maxPages = 8) {
  let after: string | undefined;
  let withChildren = true;
  let profile: { username: string; name?: string; followers_count?: number } | null = null;
  for (let page = 0; page < maxPages; page++) {
    const fields = `${MEDIA_FIELDS}${withChildren ? ",children{media_url,media_type,thumbnail_url}" : ""}`;
    const media = `media${after ? `.after(${after})` : ""}.limit(50){${fields}}`;
    let r: { business_discovery?: { username: string; name?: string; followers_count?: number; media?: { data: DiscoveredMedia[]; paging?: { cursors?: { after?: string } } } } };
    try {
      r = await graph(myIgUserId, { token, params: { fields: `business_discovery.username(${username}){username,name,followers_count,${media}}` } });
    } catch (e) {
      // Nested children aren't documented for Business Discovery; retry without them.
      if (withChildren && e instanceof GraphError && !e.authProblem && !e.transient) {
        withChildren = false;
        page--;
        continue;
      }
      throw e;
    }
    const bd = r.business_discovery;
    if (!bd) return { profile, media: null };
    profile = { username: bd.username, name: bd.name, followers_count: bd.followers_count };
    const hit = bd.media?.data.find((m) => m.shortcode === shortcode || m.permalink?.includes(`/${shortcode}`));
    if (hit) return { profile, media: hit };
    after = bd.media?.paging?.cursors?.after;
    if (!after || !bd.media?.data.length) break;
  }
  return { profile, media: null };
}

/** instagram.com/p/CODE, /reel/CODE, /tv/CODE, and /username/p/CODE links. */
export function parseInstagramUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/.test(u.hostname) && u.hostname !== "instagr.am") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => ["p", "reel", "reels", "tv"].includes(p));
  if (i === -1 || !parts[i + 1]) return null;
  const username = i > 0 ? parts[i - 1] : null;
  const shortcode = parts[i + 1];
  return { shortcode, username, url: `https://www.instagram.com/${parts[i] === "reels" ? "reel" : parts[i]}/${shortcode}/` };
}

import "server-only";
import { put } from "@vercel/blob";
import { getConnection } from "./settings";
import { decrypt } from "./secrets";
import { findPostByShortcode, type DiscoveredMedia } from "./meta/discovery";
import { describeGraphError } from "./meta/graph";
import { LK } from "../langs";
import type { Inspo } from "../types";

/** Instagram's CDN links expire, so images are copied into our own storage. */
async function rehost(url: string, name: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`image download failed (${res.status})`);
  const type = res.headers.get("content-type") || "image/jpeg";
  const blob = await put(`inspo/${name}.jpg`, await res.arrayBuffer(), { access: "public", contentType: type, addRandomSuffix: true });
  return blob.url;
}

function imageUrls(m: DiscoveredMedia) {
  const kids = m.children?.data || [];
  const pick = (x: { media_url?: string; media_type?: string; thumbnail_url?: string }) =>
    x.media_type === "VIDEO" ? x.thumbnail_url || null : x.media_url || x.thumbnail_url || null;
  const urls = kids.length ? kids.map(pick) : [pick(m)];
  return urls.filter((u): u is string => !!u).slice(0, 10);
}

/** Fills an inspo item from Business Discovery. Returns the fields to merge. */
export async function fetchFromInstagram(d: Pick<Inspo, "shortcode" | "username">): Promise<Partial<Inspo>> {
  if (!d.shortcode) return { fetchError: "Not an Instagram post link." };
  if (!d.username) return { fetchError: "Add the account's @username to fetch this post. Instagram links shared from the app don't include it." };
  const conn = await getConnection();
  const acct = LK.map((k) => conn.accounts[k]).find(Boolean);
  if (!acct) return { fetchError: "Connect an Instagram account in Settings to fetch posts." };
  const tokens = [conn.userTokenEnc, acct.tokenEnc].filter((t): t is string => !!t).map(decrypt);
  let lastErr = "";
  for (const token of tokens) {
    try {
      const { profile, media } = await findPostByShortcode(acct.igUserId, token, d.username.replace(/^@/, ""), d.shortcode);
      if (!profile) return { fetchError: `Couldn't find @${d.username}. Only Business and Creator accounts can be fetched. Drop a screenshot instead.` };
      if (!media) return { fetchError: `Found @${profile.username}, but not this post in their recent posts. Drop a screenshot instead.`, username: profile.username };
      const images: Inspo["images"] = [];
      for (const [i, u] of imageUrls(media).entries()) {
        try {
          images.push({ url: await rehost(u, `${d.shortcode}-${i + 1}`) });
        } catch {
          /* keep going with the rest */
        }
      }
      return {
        source: "api", username: profile.username, caption: media.caption || "", likes: media.like_count ?? null,
        comments: media.comments_count ?? null, mediaType: media.media_type || null, postedAt: media.timestamp || null,
        images, fetchError: images.length ? null : "Fetched the details, but Instagram didn't share the images (often for copyrighted media). Drop a screenshot.",
      };
    } catch (e) {
      lastErr = describeGraphError(e).message;
    }
  }
  return { fetchError: `Instagram didn't return this post: ${lastErr}` };
}

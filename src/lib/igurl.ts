// Parses Instagram post links. Parsing only: nothing is fetched from Instagram.
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

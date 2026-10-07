import "server-only";
import { GRAPH_VERSION, graph } from "./graph";
import { encrypt } from "../secrets";
import { mutateConnection, type MetaConnection } from "../settings";
import { LANGS } from "../../langs";
import type { Account, Lang } from "../../types";

export const SCOPES = [
  "instagram_basic", "instagram_content_publish", "instagram_manage_insights",
  "pages_show_list", "pages_read_engagement", "business_management",
];

export function appCreds() {
  const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new Error("META_APP_ID and META_APP_SECRET aren't set yet.");
  return { id, secret };
}

export function loginDialogUrl(redirectUri: string, state: string) {
  const { id } = appCreds();
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  if (process.env.META_LOGIN_CONFIG_ID) u.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID);
  else u.searchParams.set("scope", SCOPES.join(","));
  return u.toString();
}

export async function codeToToken(code: string, redirectUri: string) {
  const { id, secret } = appCreds();
  const r = await graph<{ access_token: string }>("oauth/access_token", {
    params: { client_id: id, client_secret: secret, redirect_uri: redirectUri, code },
  });
  return r.access_token;
}

async function longLived(token: string) {
  const { id, secret } = appCreds();
  const r = await graph<{ access_token: string }>("oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: token },
  });
  return r.access_token;
}

export async function debugToken(token: string) {
  const { id, secret } = appCreds();
  const r = await graph<{ data: { is_valid: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; type?: string; error?: { message: string } } }>(
    "debug_token", { params: { input_token: token, access_token: `${id}|${secret}` } },
  );
  return r.data;
}

type PageRow = {
  id: string; name: string; access_token?: string;
  instagram_business_account?: { id: string; username: string; name?: string; profile_picture_url?: string; followers_count?: number };
};

const handleOf = (k: Lang) => LANGS.find((l) => l.k === k)!.handle.replace(/^@/, "").toLowerCase();

/**
 * Takes any Facebook user token (from the login dialog, the Graph API Explorer
 * or a system user), finds the Pages it manages and their Instagram accounts,
 * and stores a Page token per account (Page tokens from a long-lived user
 * token don't expire).
 */
export async function connectWithUserToken(raw: string) {
  let token = raw.trim();
  const info = await debugToken(token);
  if (!info.is_valid) throw new Error(info.error?.message || "That token isn't valid.");
  // Short-lived user tokens are swapped for long-lived ones. System-user tokens never expire.
  if (info.expires_at && info.expires_at * 1000 - Date.now() < 7 * 864e5) {
    token = await longLived(token);
  }
  const final = await debugToken(token);
  const expiresAt = final.expires_at ? final.expires_at * 1000 : null;

  const pages: PageRow[] = [];
  let next: string | null = "me/accounts";
  let params: Record<string, string> | undefined = {
    fields: "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}", limit: "100",
  };
  while (next) {
    const r: { data: PageRow[]; paging?: { next?: string } } = await graph(next, { token: params ? token : undefined, params });
    pages.push(...r.data);
    next = r.paging?.next || null;
    params = undefined; // `next` already carries the token and fields
  }

  const now = Date.now();
  const found: Partial<Record<Lang, Account>> = {};
  const unmatched: MetaConnection["unmatched"] = [];
  for (const p of pages) {
    const ig = p.instagram_business_account;
    if (!ig) continue;
    const lang = LANGS.find((l) => handleOf(l.k) === ig.username.toLowerCase())?.k;
    if (!lang) {
      unmatched.push({ username: ig.username, pageName: p.name });
      continue;
    }
    found[lang] = {
      igUserId: ig.id, username: ig.username, name: ig.name || ig.username, pictureUrl: ig.profile_picture_url || null,
      followers: ig.followers_count ?? null, host: "graph.facebook.com",
      tokenEnc: encrypt(p.access_token || token), tokenExpiresAt: p.access_token ? null : expiresAt,
      connectedAt: now, refreshedAt: now, lastError: null,
    };
  }
  if (!Object.keys(found).length) {
    const seen = unmatched.map((u) => "@" + u.username).join(", ");
    throw new Error(
      seen
        ? `Connected, but none of the Instagram accounts matched @tradr__app, @tradr.social or @tradrsocial. Found: ${seen}.`
        : "Connected, but the token can't see any Facebook Page with a linked Instagram account. Make sure each account is linked to a Page and that you ticked all Pages and accounts in the Facebook dialog.",
    );
  }
  const conn = await mutateConnection((c) => {
    c.accounts = { ...c.accounts, ...found };
    c.userTokenEnc = encrypt(token);
    c.userTokenExpiresAt = expiresAt;
    c.unmatched = unmatched;
    c.connectedAt = now;
  });
  return { connected: Object.keys(found) as Lang[], unmatched, conn };
}

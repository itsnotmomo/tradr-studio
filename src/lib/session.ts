// Signed session cookie. Uses Web Crypto so it runs in the proxy and in route handlers.

export const SESSION_COOKIE = "tape_session";
export const SESSION_DAYS = 180;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function secret() {
  const s = process.env.TAPE_SECRET;
  if (!s || s.length < 32) throw new Error("TAPE_SECRET is missing or too short");
  return s;
}

export type SessionPayload = { email: string; ver: number; exp: number };

export async function signSession(p: SessionPayload) {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret()), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret()), Buffer.from(sig, "base64url"), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!p.exp || p.exp < Date.now()) return null;
    const allowed = (process.env.ALLOWED_EMAIL || "").trim().toLowerCase();
    if (!allowed || p.email !== allowed) return null;
    return p;
  } catch {
    return null;
  }
}

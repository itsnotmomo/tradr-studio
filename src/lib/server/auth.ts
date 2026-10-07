import "server-only";
import { cookies } from "next/headers";
import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { redis } from "./redis";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "../session";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const PW_KEY = "auth:password";
const VER_KEY = "auth:version";

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function checkPassword(pw: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return timingSafeEqual(want, got);
}

export async function setPassword(pw: string) {
  await redis().set(PW_KEY, await hashPassword(pw));
}

async function sessionVersion() {
  return Number((await redis().get(VER_KEY)) || 0);
}

/** Signs out every device. */
export async function bumpSessionVersion() {
  await redis().incr(VER_KEY);
}

/** Login attempts per IP and overall, to make guessing hopeless. */
async function rateLimit(ip: string) {
  const r = redis();
  const p = r.pipeline();
  const ipKey = `auth:fail:${ip}`;
  p.get(ipKey);
  p.get("auth:fail:all");
  const [perIp, all] = (await p.exec()) as [string | null, string | null];
  return Number(perIp || 0) >= 8 || Number(all || 0) >= 40;
}
async function recordFailure(ip: string) {
  const p = redis().pipeline();
  p.incr(`auth:fail:${ip}`);
  p.expire(`auth:fail:${ip}`, 15 * 60);
  p.incr("auth:fail:all");
  p.expire("auth:fail:all", 60 * 60);
  await p.exec();
}

export async function login(email: string, password: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const allowed = (process.env.ALLOWED_EMAIL || "").trim().toLowerCase();
  if (await rateLimit(ip)) return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  const stored = (await redis().get(PW_KEY)) as string | null;
  const emailOk = !!allowed && email.trim().toLowerCase() === allowed;
  const pwOk = !!stored && (await checkPassword(password, stored));
  if (!emailOk || !pwOk) {
    await recordFailure(ip);
    return { ok: false, error: "That email and password don't match." };
  }
  await issueSession();
  return { ok: true };
}

export async function issueSession() {
  const email = (process.env.ALLOWED_EMAIL || "").trim().toLowerCase();
  const token = await signSession({ email, ver: await sessionVersion(), exp: Date.now() + SESSION_DAYS * 864e5 });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Full check for API routes: signature, expiry, email and session version. */
export async function requireSession() {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  if (s.ver !== (await sessionVersion())) return null;
  return s;
}

export async function verifyPassword(pw: string) {
  const stored = (await redis().get(PW_KEY)) as string | null;
  return !!stored && checkPassword(pw, stored);
}

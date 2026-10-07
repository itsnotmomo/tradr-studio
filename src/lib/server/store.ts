import "server-only";
import { hashToObject, redis } from "./redis";
import { LK } from "../langs";
import { slotFromTime } from "../slots";
import type { Inspo, Lang, PlanItem, Post, Settings, Variant } from "../types";

// ---------------------------------------------------------------------------
// Documents live as JSON in Redis hashes (one hash per collection) with a
// sibling hash of revision numbers. Every write is a compare-and-set in Lua,
// so the scheduler and the editor can never overwrite each other's changes.
// Posts also maintain two sorted sets the scheduler reads:
//   due      "postId:lang" → when to publish (ms)
//   inflight "postId:lang" → when the current publish attempt started (ms)
// ---------------------------------------------------------------------------

const CAS = `
local cur = redis.call('HGET', KEYS[2], ARGV[1])
if (cur or '0') ~= ARGV[2] then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
local nr = redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
for i = 4, #ARGV, 3 do
  local m = ARGV[1] .. ':' .. ARGV[i]
  if ARGV[i + 1] == '' then redis.call('ZREM', KEYS[3], m) else redis.call('ZADD', KEYS[3], ARGV[i + 1], m) end
  if ARGV[i + 2] == '' then redis.call('ZREM', KEYS[4], m) else redis.call('ZADD', KEYS[4], ARGV[i + 2], m) end
end
return nr`;

const DEL = `
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], ARGV[1])
for i = 2, #ARGV do
  redis.call('ZREM', KEYS[3], ARGV[1] .. ':' .. ARGV[i])
  redis.call('ZREM', KEYS[4], ARGV[1] .. ':' .. ARGV[i])
end
return 1`;

type Coll = "posts" | "inspo" | "plans" | "kv";
const K = { due: "due", inflight: "inflight" };

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
/** Thrown by mutators to reject a change with a message meant for the user. */
export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readAll<T>(coll: Coll): Promise<T[]> {
  const p = redis().pipeline();
  p.hgetall(coll);
  p.hgetall(coll + ":rev");
  const [rawDocs, rawRevs] = await p.exec();
  const docs = hashToObject(rawDocs), revs = hashToObject(rawRevs);
  return Object.entries(docs).map(([id, json]) => ({ ...JSON.parse(json), rev: Number(revs[id] || 0) }));
}

async function readOne<T>(coll: Coll, id: string): Promise<T | null> {
  const p = redis().pipeline();
  p.hget(coll, id);
  p.hget(coll + ":rev", id);
  const [json, rev] = (await p.exec()) as [string | null, string | number | null];
  if (!json) return null;
  return { ...JSON.parse(json), rev: Number(rev || 0) };
}

function postIndexArgs(p: Post) {
  const out: string[] = [];
  for (const k of LK) {
    const v = p.variants[k];
    const due = v.state === "scheduled" ? String(v.nextAttemptAt ?? v.scheduledAt ?? "") : "";
    const inflight = v.state === "publishing" ? String(v.attemptStartedAt ?? Date.now()) : "";
    out.push(k, due, inflight);
  }
  return out;
}

async function cas(coll: Coll, id: string, expectedRev: number, doc: { rev?: number }, extra: string[] = []) {
  const { rev: _rev, ...body } = doc;
  void _rev;
  const r = await redis().eval(CAS, [coll, coll + ":rev", K.due, K.inflight], [id, String(expectedRev), JSON.stringify(body), ...extra]);
  if (Number(r) === -1) throw new ConflictError(`${coll}/${id} changed`);
  return Number(r);
}

async function mutate<T extends { rev: number }>(
  coll: Coll, id: string, fn: (doc: T) => T | void | Promise<T | void>, index?: (doc: T) => string[], fallback?: () => T,
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = (await readOne<T>(coll, id)) ?? (fallback ? { ...fallback(), rev: 0 } : null);
    if (!cur) throw new NotFoundError(`${coll}/${id} not found`);
    const draft: T = structuredClone(cur);
    const next = ((await fn(draft)) ?? draft) as T;
    try {
      const rev = await cas(coll, id, cur.rev, next, index ? index(next) : []);
      return { ...next, rev };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 120));
    }
  }
  throw new ConflictError(`Couldn't save ${coll}/${id}: too many simultaneous changes`);
}

// ---------- Posts ----------

export const uid = () => crypto.randomUUID();

export function blankVariant(s: Settings, k: Lang): Variant {
  return {
    comment: "", tradr: s.langs[k].tradr, hashtags: s.langs[k].hashtags, slides: [], ready: false,
    state: "idle", scheduledAt: null, nextAttemptAt: null, attempts: 0, attemptStartedAt: null, stage: null,
    error: null, log: [], igMediaId: null, permalink: null, publishedAt: null, metrics: null, metricsError: null,
  };
}

/** Posts saved before slots had an HH:MM time instead. */
function normalizePost(p: Post & { time?: string }): Post {
  if (!p.slot) p.slot = slotFromTime(p.time);
  delete p.time;
  return p;
}

export const listPosts = async () => (await readAll<Post>("posts")).map(normalizePost);
export const getPost = async (id: string) => {
  const p = await readOne<Post>("posts", id);
  return p && normalizePost(p);
};

export async function createPost(init: Partial<Post>, s: Settings): Promise<Post> {
  const now = Date.now();
  const variants = {} as Record<Lang, Variant>;
  for (const k of LK) variants[k] = { ...blankVariant(s, k), ...(init.variants?.[k] || {}) };
  const p: Post = {
    id: uid(), title: "", notes: "", date: null, slot: "morning", inspoId: null, createdAt: now, updatedAt: now,
    ...init, variants, rev: 0,
  };
  p.rev = await cas("posts", p.id, 0, p, postIndexArgs(p));
  return p;
}

export function mutatePost(id: string, fn: (p: Post) => Post | void | Promise<Post | void>) {
  return mutate<Post>("posts", id, async (p) => {
    normalizePost(p);
    const out = (await fn(p)) ?? p;
    out.updatedAt = Date.now();
    return out;
  }, postIndexArgs);
}

export async function deletePost(id: string) {
  await redis().eval(DEL, ["posts", "posts:rev", K.due, K.inflight], [id, ...LK]);
}

/** Variants whose publish time has come. Returns [postId, lang] pairs. */
export async function dueVariants(now: number, limit = 10): Promise<[string, Lang][]> {
  const members = (await redis().zrange(K.due, 0, now, { byScore: true, offset: 0, count: limit })) as string[];
  return members.map((m) => m.split(":") as [string, Lang]);
}
export async function stuckVariants(olderThan: number): Promise<[string, Lang][]> {
  const members = (await redis().zrange(K.inflight, 0, olderThan, { byScore: true })) as string[];
  return members.map((m) => m.split(":") as [string, Lang]);
}
export async function nextDueAt(): Promise<number | null> {
  const r = (await redis().zrange(K.due, 0, 0, { withScores: true })) as (string | number)[];
  return r.length >= 2 ? Number(r[1]) : null;
}

// ---------- Inspo ----------

export const listInspo = () => readAll<Inspo>("inspo");
export const getInspo = (id: string) => readOne<Inspo>("inspo", id);
export async function createInspo(init: Partial<Inspo>): Promise<Inspo> {
  const now = Date.now();
  const doc: Inspo = {
    id: uid(), url: null, shortcode: null, username: null, description: "", format: null, likes: null, comments: null,
    images: [], status: "todo", tags: [], notes: "", postId: null, createdAt: now, updatedAt: now, ...init, rev: 0,
  };
  doc.rev = await cas("inspo", doc.id, 0, doc);
  return doc;
}
export const mutateInspo = (id: string, fn: (d: Inspo) => Inspo | void | Promise<Inspo | void>) =>
  mutate<Inspo>("inspo", id, async (d) => {
    const out = (await fn(d)) ?? d;
    out.updatedAt = Date.now();
    return out;
  });
export async function deleteInspo(id: string) {
  await redis().eval(DEL, ["inspo", "inspo:rev", K.due, K.inflight], [id]);
}

// ---------- Content plan ----------

export const listPlans = () => readAll<PlanItem>("plans");
export async function createPlan(init: Omit<PlanItem, "id" | "rev" | "createdAt" | "updatedAt">): Promise<PlanItem> {
  const now = Date.now();
  const doc: PlanItem = { id: uid(), ...init, createdAt: now, updatedAt: now, rev: 0 };
  doc.rev = await cas("plans", doc.id, 0, doc);
  return doc;
}
export const mutatePlan = (id: string, fn: (d: PlanItem) => PlanItem | void) =>
  mutate<PlanItem>("plans", id, (d) => {
    const out = fn(d) ?? d;
    out.updatedAt = Date.now();
    return out;
  });

// ---------- Key-value documents (settings, accounts) ----------

export async function getKv<T>(id: string, fallback: () => T): Promise<T & { rev: number }> {
  return (await readOne<T & { rev: number }>("kv", id)) ?? { ...fallback(), rev: 0 };
}
export const mutateKv = <T>(id: string, fallback: () => T, fn: (d: T & { rev: number }) => (T & { rev: number }) | void) =>
  mutate<T & { rev: number }>("kv", id, fn, undefined, () => ({ ...fallback(), rev: 0 }));

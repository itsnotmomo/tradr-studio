"use client";

import { isDone } from "../status";
import { addDays, ymd } from "../time";
import type { Lang, Post } from "../types";

/** Posting order inside a post: Italian, Spanish, English (earliest local time first). */
export const POST_ORDER: Lang[] = ["it", "es", "en"];

export type Range = { from: string; to: string };
export const defaultRange = (days = 7): Range => ({ from: ymd(new Date()), to: ymd(addDays(new Date(), days - 1)) });

export const inRange = (p: Post, r: Range) => !!p.date && p.date >= r.from && p.date <= r.to;
const bySlot = (a: Post, b: Post) => a.date!.localeCompare(b.date!) || (a.slot === b.slot ? a.createdAt - b.createdAt : a.slot === "morning" ? -1 : 1);

/** Every (post, account) in the range, in slot order. */
export function sequence(posts: Post[], r: Range) {
  return posts.filter((p) => inRange(p, r)).sort(bySlot).flatMap((p) => POST_ORDER.map((k) => ({ post: p, k })));
}

/** The next item after (id, k) that isn't scheduled or posted yet. */
export function nextAfter(posts: Post[], r: Range, id: string, k: Lang) {
  const seq = sequence(posts, r);
  const i = seq.findIndex((x) => x.post.id === id && x.k === k);
  return [...seq.slice(i + 1), ...seq.slice(0, Math.max(0, i))].find((x) => !isDone(x.post.variants[x.k].status)) || null;
}

export const rangeQuery = (r: Range) => `from=${r.from}&to=${r.to}`;

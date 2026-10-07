"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { api, fetcher } from "./api";
import { LK } from "../langs";
import type { AccountPublic, Lang, Post, SchedulerHealth, Settings, Slot } from "../types";

export type AppState = {
  posts: Post[];
  settings: Settings;
  health: SchedulerHealth;
  now: number;
  meta: {
    configured: boolean;
    accounts: Partial<Record<Lang, AccountPublic>>;
    unmatched: { username: string; pageName: string }[];
    userTokenExpiresAt: number | null;
    connectedAt: number | null;
  };
};

const KEY = "/api/state";

/** Polls fast while something is publishing or about to, slowly otherwise. */
function interval(d?: AppState) {
  if (!d) return 0;
  const soon = Date.now() + 3 * 60_000;
  const busy = d.posts.some((p) =>
    LK.some((k) => {
      const v = p.variants[k];
      return v.state === "publishing" || (v.state === "scheduled" && (v.nextAttemptAt ?? v.scheduledAt ?? Infinity) < soon);
    }),
  );
  return busy ? 4000 : 60_000;
}

export function useAppState() {
  const swr = useSWR<AppState>(KEY, fetcher, { refreshInterval: interval, revalidateOnFocus: true, keepPreviousData: true });
  return swr;
}

export const refreshState = () => globalMutate(KEY);

/** Replace one post in the cached state (after a server response). */
export function putPost(post: Post) {
  return globalMutate<AppState>(KEY, (d) => (d ? { ...d, posts: upsert(d.posts, post) } : d), { revalidate: false });
}
export function dropPost(id: string) {
  return globalMutate<AppState>(KEY, (d) => (d ? { ...d, posts: d.posts.filter((p) => p.id !== id) } : d), { revalidate: false });
}
const upsert = (list: Post[], p: Post) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);

export type PostPatch = {
  title?: string; notes?: string; date?: string | null; slot?: Slot; inspoId?: string | null;
  variants?: Partial<Record<Lang, Partial<Pick<Post["variants"]["en"], "comment" | "tradr" | "hashtags" | "slides" | "ready" | "status" | "video" | "cover" | "frame">>>>;
};

/** Optimistic edit: the UI updates at once, rolls back if the server says no. */
export async function patchPost(id: string, patch: PostPatch) {
  await globalMutate<AppState>(
    KEY,
    (d) => {
      if (!d) return d;
      return {
        ...d,
        posts: d.posts.map((p) => {
          if (p.id !== id) return p;
          const n: Post = { ...p, ...patch, variants: { ...p.variants } } as Post;
          for (const [k, vp] of Object.entries(patch.variants || {})) n.variants[k as Lang] = { ...p.variants[k as Lang], ...vp };
          return n;
        }),
      };
    },
    { revalidate: false },
  );
  try {
    const r = await api<{ post: Post; notes: string[] }>(`/api/posts/${id}`, { method: "PATCH", body: patch });
    await putPost(r.post);
    return r;
  } catch (e) {
    await refreshState();
    throw e;
  }
}

export async function createPost(init: { title?: string; date?: string | null; slot?: Slot; kind?: "post" | "reel"; inspoId?: string; planId?: string; slides?: Partial<Record<Lang, unknown[]>> }) {
  const p = await api<Post>("/api/posts", { body: init });
  await putPost(p);
  return p;
}

export async function postAction(id: string, action: "schedule" | "now" | "unschedule" | "retry" | "metrics", langs: Lang[]) {
  const r = await api<{ post: Post }>(`/api/posts/${id}/actions`, { body: { action, langs } });
  if (r.post) await putPost(r.post);
  if (action === "now" || action === "retry") setTimeout(refreshState, 2500);
  return r;
}

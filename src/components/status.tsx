"use client";

import { useState } from "react";
import { useToast } from "./toast";
import { useNamed } from "./name-prompt";
import { patchPost } from "@/lib/client/state";
import { MANUAL_STATUSES } from "@/lib/status";
import type { Lang, Post, PostStatus } from "@/lib/types";

/** Tap to set one language's status: draft → ready → scheduled in Instagram → posted. */
export function StatusSetter({ post, k, big }: { post: Post; k: Lang; big?: boolean }) {
  const toast = useToast();
  const named = useNamed();
  const [busy, setBusy] = useState(false);
  const cur = post.variants[k].status;
  const set = async (status: PostStatus) => {
    if (status === cur || busy) return;
    setBusy(true);
    try {
      await named((title) => patchPost(post.id, { ...(title ? { title } : {}), variants: { [k]: { status } } }));
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`seg w-full ${big ? "!rounded-xl" : ""}`} role="group" aria-label="Status">
      {MANUAL_STATUSES.map((s) => (
        <button key={s.k} aria-pressed={cur === s.k} onClick={() => set(s.k)} className={`flex-1 !px-1 ${big ? "!min-h-[40px] !text-[13px]" : ""}`}
          style={cur === s.k ? { background: `var(--s-${s.k})`, color: s.k === "ready" ? "#111" : "#fff" } : undefined}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

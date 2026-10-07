"use client";

import { useState } from "react";
import Link from "next/link";
import { PreviewThumb } from "@/components/slide-viewer";
import { PageHeader, LangDots, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useNamed } from "@/components/name-prompt";
import { createPost, patchPost, useAppState } from "@/lib/client/state";
import { freeSlot, slotName } from "@/lib/slots";
import { fmtDate, ymd } from "@/lib/time";

export default function IdeasPage() {
  const { data } = useAppState();
  const toast = useToast();
  const named = useNamed();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;
  const ideas = data.posts.filter((p) => !p.date).sort((a, b) => b.createdAt - a.createdAt);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createPost({ title: title.trim(), date: null });
      setTitle("");
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const plan = async (id: string, date: string) => {
    const slot = freeSlot(data.posts, date, id);
    const day = fmtDate(date, { weekday: "short", day: "numeric", month: "short" });
    if (!slot) {
      toast(`Both slots on ${day} are taken. Pick another day.`, { tone: "error" });
      return;
    }
    try {
      const r = await named((title) => patchPost(id, { date, slot, ...(title ? { title } : {}) }));
      if (r) toast(`Planned for ${day}, ${slotName(slot)}.`);
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    }
  };

  return (
    <div className="max-w-[900px]">
      <PageHeader title="Ideas" sub="Posts without a date. Give one a date to put it on the planner." />
      <form onSubmit={add} className="px-4 md:px-6 flex gap-2">
        <input className="field !bg-[var(--panel)]" placeholder="New idea… (press Enter)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New idea" />
        <button className="btn primary" disabled={busy || !title.trim()}><Icon name="plus" size={16} /> Add</button>
      </form>
      <ul className="px-4 md:px-6 py-4 flex flex-col gap-2">
        {ideas.map((p) => {
          return (
            <li key={p.id} className="card flex items-center gap-3 p-2 pr-3">
              <Link href={`/posts/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <PreviewThumb post={p} lang={"all"} className="w-12" />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.title || "Untitled"}</div>
                  <div className="text-[12px] muted flex items-center gap-2 mt-0.5">
                    <LangDots post={p} />
                    <span className="hidden sm:inline">· added {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
              </Link>
              <label className="btn small cursor-pointer relative">
                Plan
                <input type="date" className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Pick a date" min={ymd(new Date())} onChange={(e) => e.target.value && plan(p.id, e.target.value)} />
              </label>
            </li>
          );
        })}
        {!ideas.length && <li className="muted text-center py-10">No ideas yet. Add one above, or save something from Inspo.</li>}
      </ul>
    </div>
  );
}

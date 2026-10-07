"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Spinner } from "./ui";
import { useToast } from "./toast";
import { useNamed } from "./name-prompt";
import { createPost, patchPost, useAppState } from "@/lib/client/state";
import { uploadSlide } from "@/lib/client/upload";
import { isLocked } from "@/lib/status";
import { LANGS, LK } from "@/lib/langs";
import { SLOTS, slotName } from "@/lib/slots";
import { fmtDate, ymd } from "@/lib/time";
import type { Lang, Post, Slide, Slot } from "@/lib/types";

const label = (p: Post) => `${p.date ? `${fmtDate(p.date, { weekday: "short", day: "numeric", month: "short" })} ${slotName(p.slot)}` : "Idea"} · ${p.title || "Untitled"}`;

/**
 * Sends images from a tool into a post: each language's image goes into that
 * language's slides, after the existing ones and before the Tradr slide.
 */
export function AddToPost({ open, onClose, render, available, defaultLangs, targetPostId }: {
  open: boolean; onClose: () => void;
  /** Produces the image for one language. */
  render: (k: Lang) => Promise<Blob>;
  available: Lang[]; defaultLangs?: Lang[]; targetPostId?: string | null;
}) {
  const { data } = useAppState();
  const router = useRouter();
  const toast = useToast();
  const named = useNamed();
  const today = ymd(new Date());
  const upcoming = useMemo(
    () => (data?.posts || []).filter((p) => p.kind !== "reel" && (!p.date || p.date >= today)).filter((p) => LK.some((k) => !isLocked(p.variants[k])))
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.slot.localeCompare(b.slot) * -1),
    [data?.posts, today],
  );
  const [sel, setSel] = useState<string>("__new");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<Slot | "">("");
  const [langs, setLangs] = useState<Lang[]>([]);
  const [previews, setPreviews] = useState<Partial<Record<Lang, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSel(targetPostId || upcoming[0]?.id || "__new");
    setLangs(defaultLangs?.length ? defaultLangs : available);
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const out: Partial<Record<Lang, string>> = {};
      for (const k of available) {
        const u = URL.createObjectURL(await render(k));
        urls.push(u);
        out[k] = u;
      }
      if (!cancelled) setPreviews(out);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = async () => {
    setBusy(true);
    try {
      const uploaded: Partial<Record<Lang, Slide>> = {};
      for (const k of langs) uploaded[k] = await uploadSlide(await render(k));
      let post: Post;
      if (sel === "__new") {
        const created = await named((t) => createPost({ title: t || title, date: date || null, slot: slot || undefined, slides: Object.fromEntries(langs.map((k) => [k, [uploaded[k]]])) }));
        if (!created) return;
        post = created;
      } else {
        post = data!.posts.find((p) => p.id === sel)!;
        const skipped = langs.filter((k) => isLocked(post.variants[k]));
        const variants: Record<string, { slides: Slide[] }> = {};
        for (const k of langs) if (!skipped.includes(k)) variants[k] = { slides: [...post.variants[k].slides, uploaded[k]!] };
        await patchPost(post.id, { variants });
        if (skipped.length) toast(`Skipped ${skipped.map((k) => k.toUpperCase()).join(", ")}: already posted.`);
      }
      onClose();
      toast(`Added to “${post.title || title || "Untitled"}”.`, { action: { label: "Open post", fn: () => router.push(`/posts/${post.id}?lang=${langs[0]}`) } });
      if (targetPostId) router.push(`/posts/${post.id}?lang=${langs[0]}`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Add to a post">
      <div className="p-5 flex flex-col gap-4">
        <h3 className="font-bold text-[16px]">Add to a post</h3>
        <div className="flex gap-2">
          {available.map((k) => (
            <label key={k} className="flex flex-col items-center gap-1 cursor-pointer">
              {previews[k]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={previews[k]} alt="" className="w-[84px] aspect-[4/5] object-cover rounded-md" style={{ opacity: langs.includes(k) ? 1 : 0.35 }} />
                : <div className="w-[84px] aspect-[4/5] rounded-md flex items-center justify-center" style={{ background: "var(--soft)" }}><Spinner /></div>}
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                <input type="checkbox" className="chk" checked={langs.includes(k)} onChange={(e) => setLangs((xs) => (e.target.checked ? [...xs, k] : xs.filter((x) => x !== k)))} />
                {LANGS.find((l) => l.k === k)!.code}
              </span>
            </label>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="s_post">Post</label>
          <select id="s_post" className="field" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="__new">New post…</option>
            {upcoming.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
          </select>
        </div>
        {sel === "__new" && (<>
          <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2">
            <div><label className="label" htmlFor="s_title">Title</label><input id="s_title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><label className="label" htmlFor="s_date">Day</label><input id="s_date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="label" htmlFor="s_slot">Slot</label>
              <select id="s_slot" className="field" value={slot} onChange={(e) => setSlot(e.target.value as Slot | "")}>
                <option value="">First free</option>
                {SLOTS.map((x) => <option key={x.k} value={x.k}>{x.name}</option>)}
              </select></div>
          </div>
          <p className="text-[12px] muted -mt-2">Clear the day to save it to Ideas.</p>
        </>)}
        <p className="text-[12px] muted -mt-1">Each language goes into its own version, after the existing slides and before the Tradr slide.</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={go} disabled={busy || !langs.length}>{busy ? <><Spinner /> Adding…</> : "Add"}</button>
        </div>
      </div>
    </Sheet>
  );
}

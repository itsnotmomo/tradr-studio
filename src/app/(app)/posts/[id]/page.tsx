"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Icon } from "@/components/icons";
import { ConfirmButton, PublishAll, PublishControls, copyText, slotTimeLabel } from "@/components/publish";
import { Spinner, StatusPill, Warn } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client/api";
import { dropPost, patchPost, useAppState, type AppState } from "@/lib/client/state";
import { downloadUrl, imageFiles, uploadSlides } from "@/lib/client/upload";
import { buildCaption, charCount, hashtagCount } from "@/lib/caption";
import { CAPTION_MAX, HASHTAG_MAX } from "@/lib/rules";
import { isLocked, statusOf } from "@/lib/status";
import { AUTO_PUBLISH } from "@/lib/features";
import { StatusSetter } from "@/components/status";
import { useAskName } from "@/components/name-prompt";
import { ApiError } from "@/lib/client/api";
import { LANGS, isLang } from "@/lib/langs";
import { SLOTS, slotTimes } from "@/lib/slots";
import type { Inspo, Lang, Post, Slide } from "@/lib/types";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useAppState();
  const search = useSearchParams();
  const q = search.get("lang");
  const [k, setK] = useState<Lang>(isLang(q) ? q : "en");
  const post = data?.posts.find((p) => p.id === id);

  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;
  if (!post) return <div className="p-6">This post doesn’t exist anymore. <Link className="underline" href="/">Back to the planner</Link></div>;
  return <Editor key={post.id} post={post} data={data} k={k} setK={setK} />;
}

function useSaver(onNamed?: (title: string) => void) {
  const toast = useToast();
  const askName = useAskName();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const save = useCallback(async (id: string, patch: Parameters<typeof patchPost>[1]) => {
    // Clearing the name of a planned post isn't allowed; just don't save the empty name.
    if (patch.title !== undefined && !patch.title.trim() && Object.keys(patch).length === 1) return;
    setState("saving");
    try {
      let r;
      try {
        r = await patchPost(id, patch);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 422) throw e;
        const title = await askName();
        if (!title) {
          setState("idle");
          return;
        }
        r = await patchPost(id, { ...patch, title });
        onNamed?.(title);
      }
      setState("saved");
      if (r.notes.length) toast(r.notes.join(" "));
    } catch (e) {
      setState("error");
      toast(`Not saved: ${(e as Error).message}`, { tone: "error" });
    }
  }, [toast, askName, onNamed]);
  return { state, save };
}

function Editor({ post, data, k, setK }: { post: Post; data: AppState; k: Lang; setK: (k: Lang) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(post.title);
  const { state: saveState, save } = useSaver(setTitle);
  const titleT = useRef<ReturnType<typeof setTimeout>>(undefined);

  const del = async () => {
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE" });
      await dropPost(post.id);
      router.push(post.date ? "/" : "/ideas");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  return (
    <div className="pb-16">
      <div className="sticky top-0 z-20 border-b px-3 md:px-6 py-2.5 flex flex-wrap items-end gap-2 md:gap-3" style={{ background: "color-mix(in srgb, var(--bg) 90%, transparent)", backdropFilter: "blur(10px)", borderColor: "var(--line)" }}>
        <button className="btn small ghost self-center" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} aria-label="Back"><Icon name="back" size={18} /></button>
        <div className="flex-1 min-w-[180px]">
          <label className="label" htmlFor="p_title">Post</label>
          <input id="p_title" className="field !bg-[var(--panel)] font-semibold text-[15px]" placeholder="What's this post about?" value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearTimeout(titleT.current);
              const v = e.target.value;
              titleT.current = setTimeout(() => save(post.id, { title: v }), 600);
            }} />
        </div>
        <div className="w-[150px]">
          <label className="label" htmlFor="p_date">Date</label>
          <input id="p_date" type="date" className="field !bg-[var(--panel)]" value={post.date || ""} onChange={(e) => save(post.id, { date: e.target.value || null })} />
        </div>
        <div className="w-[130px]">
          <label className="label" htmlFor="p_slot">Slot</label>
          <select id="p_slot" className="field !bg-[var(--panel)]" value={post.slot} onChange={(e) => save(post.id, { slot: e.target.value as "morning" | "afternoon" })}
            title={slotTimes(data.settings, post.slot)}>
            {SLOTS.map((x) => <option key={x.k} value={x.k}>{x.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 self-center pt-4">
          <span className="text-[12px] muted w-[52px]" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? <span style={{ color: "var(--danger)" }}>Not saved</span> : ""}</span>
          {post.date && <button className="btn small" onClick={() => save(post.id, { date: null })}>To Ideas</button>}
          <ConfirmButton className="btn small danger" confirm="Tap again to delete" onConfirm={del}><Icon name="trash" size={14} /></ConfirmButton>
        </div>
      </div>

      <div className="px-3 md:px-6 pt-4 flex flex-col gap-4 max-w-[1280px]">
        {AUTO_PUBLISH && <PublishAll post={post} data={data} />}

        <div className="flex gap-1.5 scroll-x" role="tablist" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.k} role="tab" aria-selected={k === l.k} onClick={() => { setK(l.k); router.replace(`/posts/${post.id}?lang=${l.k}`, { scroll: false }); }}
              className="flex items-center gap-2 rounded-xl border px-3 py-2 flex-none"
              style={{ background: "var(--panel)", borderColor: k === l.k ? "var(--ink)" : "var(--line)", boxShadow: k === l.k ? "inset 0 0 0 1px var(--ink)" : undefined }}>
              <span className="font-bold text-[13.5px]">{l.name}</span>
              <span className="text-[12px] muted hidden sm:inline">{l.handle}</span>
              <StatusPill s={statusOf(post, l.k, data.settings)} />
            </button>
          ))}
        </div>

        <LangEditor key={k} post={post} k={k} data={data} save={save} />

        <Notes post={post} save={save} />
      </div>
    </div>
  );
}

function LangEditor({ post, k, data, save }: { post: Post; k: Lang; data: AppState; save: (id: string, patch: Parameters<typeof patchPost>[1]) => Promise<void> }) {
  const v = post.variants[k];
  const locked = isLocked(v);
  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5">
      <section className="card p-3 md:p-4 flex flex-col gap-3">
        <Slides post={post} k={k} data={data} locked={locked} save={save} />
      </section>
      <section className="flex flex-col gap-4">
        <div className="card p-3 md:p-4">
          <h2 className="font-bold text-[13px] mb-2.5">
            {AUTO_PUBLISH ? "Publish to" : "Post to"} {LANGS.find((l) => l.k === k)!.handle}
            {post.date && <span className="muted font-medium"> · {slotTimeLabel(data.settings, k, post)}</span>}
          </h2>
          {AUTO_PUBLISH ? <PublishControls post={post} k={k} data={data} /> : (
            <div className="flex flex-col gap-2.5">
              <StatusSetter post={post} k={k} />
              <Link href={`/go/${post.id}/${k}`} className="btn primary">Open posting screen</Link>
            </div>
          )}
        </div>
        <div className="card p-3 md:p-4">
          <Caption post={post} k={k} data={data} locked={locked} save={save} />
        </div>
        {v.log.length > 0 && (
          <details className="card p-3 md:p-4 text-[12.5px]">
            <summary className="cursor-pointer font-semibold">Activity</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {[...v.log].reverse().map((l, i) => (
                <li key={i} className="flex gap-3"><span className="muted tabular-nums flex-none">{new Date(l.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span>{l.msg}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function Slides({ post, k, data, locked, save }: { post: Post; k: Lang; data: AppState; locked: boolean; save: (id: string, patch: Parameters<typeof patchPost>[1]) => Promise<void> }) {
  const toast = useToast();
  const v = post.variants[k];
  const end = data.settings.langs[k].tradrSlide;
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [copyFrom, setCopyFrom] = useState<Lang>(k === "en" ? "es" : "en");
  const slidesRef = useRef(v.slides);
  useEffect(() => {
    slidesRef.current = v.slides;
  }, [v.slides]);

  const setSlides = (slides: Slide[]) => save(post.id, { variants: { [k]: { slides } } });

  const add = useCallback(async (files: File[]) => {
    if (locked || !files.length) return;
    setUploading((n) => n + files.length);
    try {
      const added = await uploadSlides(files);
      await save(post.id, { variants: { [k]: { slides: [...slidesRef.current, ...added] } } });
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`, { tone: "error" });
    } finally {
      setUploading((n) => Math.max(0, n - files.length));
    }
  }, [k, locked, post.id, save, toast]);

  // Paste images anywhere on the page (except into text fields).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const files = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()!).filter(Boolean);
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const move = (i: number, d: number) => {
    const a = [...v.slides];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    setSlides(a);
  };
  const remove = (i: number) => setSlides(v.slides.filter((_, j) => j !== i));
  const download = async () => {
    const all = [...v.slides, ...(end ? [end] : [])];
    for (const [i, s] of all.entries()) {
      await downloadUrl(s.url, `${post.date || "idea"}_${k.toUpperCase()}_${String(i + 1).padStart(2, "0")}.jpg`);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-[13px]">Slides <span className="muted font-medium">· {v.slides.length + (end ? 1 : 0)} total</span></h2>
        <button className="btn small ghost" onClick={download} disabled={!v.slides.length}><Icon name="download" size={14} /> Download</button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2"
        onDragOver={(e) => { if (!locked && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(imageFiles(e.dataTransfer.files)); }}>
        {v.slides.map((s, i) => (
          <div key={s.id + i} className="group relative rounded-lg overflow-hidden aspect-[4/5]" style={{ background: "#1a1a1a" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
            <span className="absolute top-1.5 left-1.5 text-[11px] font-bold text-white bg-black/65 rounded px-1.5">{i + 1}</span>
            {!locked && (
              <div className="absolute bottom-1.5 inset-x-1.5 flex justify-center gap-1 md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                {[["‹", i > 0, () => move(i, -1), "Move left"], ["›", i < v.slides.length - 1, () => move(i, 1), "Move right"], ["×", true, () => remove(i), "Remove slide"]].map(([label, ok, fn, aria]) => (
                  <button key={aria as string} aria-label={aria as string} disabled={!ok} onClick={fn as () => void}
                    className="w-8 h-7 rounded bg-white/95 text-black font-bold disabled:opacity-30">{label as string}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {[...Array(uploading)].map((_, i) => (
          <div key={"u" + i} className="rounded-lg aspect-[4/5] flex items-center justify-center gap-2 text-[12px] muted border" style={{ borderColor: "var(--line)" }}><Spinner /> Uploading</div>
        ))}
        {!locked && (
          <label className={`rounded-lg aspect-[4/5] border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-center text-[12px] muted p-2 hover:border-[var(--focus)] ${over ? "drop-on" : ""}`} style={{ borderColor: "var(--line)" }}>
            <Icon name="plus" size={20} />
            Add images
            <span className="text-[11px] hidden md:block">or paste / drop</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(imageFiles(e.target.files)); e.target.value = ""; }} />
          </label>
        )}
        <div className="relative rounded-lg overflow-hidden aspect-[4/5] ring-2 ring-[var(--s-posted)] ring-inset" style={{ background: "#1a1a1a" }} title="The Tradr slide is always last">
          {end
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={end.url} alt="Tradr slide" className="w-full h-full object-cover" />
            : <Link href="/settings" className="flex h-full items-center justify-center text-center text-[12px] text-[#bbb] p-2">Tradr slide not set. Add it in Settings.</Link>}
          <span className="absolute top-1.5 left-1.5 text-[11px] font-bold text-white rounded px-1.5 flex items-center gap-1" style={{ background: "var(--s-posted)" }}>
            <Icon name="lock" size={11} /> {v.slides.length + 1} · Tradr
          </span>
        </div>
      </div>
      {!locked && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link className="btn small" href={`/tools/tweet?post=${post.id}`}><Icon name="tweet" size={14} /> Tweet card</Link>
          <Link className="btn small" href={`/tools/editor?post=${post.id}&lang=${k}`}><Icon name="editor" size={14} /> Edit image text</Link>
          <span className="flex-1" />
          <select className="field !w-auto !min-h-[28px] !py-1 text-[12px]" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value as Lang)} aria-label="Copy slides from">
            {LANGS.filter((l) => l.k !== k).map((l) => <option key={l.k} value={l.k}>{l.name}</option>)}
          </select>
          <button className="btn small" disabled={!post.variants[copyFrom].slides.length}
            onClick={() => setSlides([...v.slides, ...post.variants[copyFrom].slides.map((s) => ({ ...s, id: crypto.randomUUID() }))])}>
            Copy slides from {LANGS.find((l) => l.k === copyFrom)!.code}
          </button>
        </div>
      )}
      {locked && <Warn>{v.state === "posted" ? "Posted. Slides can’t change anymore." : "Publishing. Slides are locked."}</Warn>}
    </>
  );
}

function Caption({ post, k, data, locked, save }: { post: Post; k: Lang; data: AppState; locked: boolean; save: (id: string, patch: Parameters<typeof patchPost>[1]) => Promise<void> }) {
  const toast = useToast();
  const v = post.variants[k];
  const defs = data.settings.langs[k];
  const [parts, setParts] = useState({ comment: v.comment, tradr: v.tradr, hashtags: v.hashtags });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Partial<typeof parts>>({});

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = {};
    if (Object.keys(p).length) save(post.id, { variants: { [k]: p } });
  }, [k, post.id, save]);
  useEffect(() => flush, [flush]); // save on tab switch / leave

  const set = (f: keyof typeof parts, val: string) => {
    setParts((x) => ({ ...x, [f]: val }));
    pending.current[f] = val;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  const cap = buildCaption(parts);
  const chars = charCount(cap), tags = hashtagCount(cap);

  const field = (f: keyof typeof parts, label: string, rows: number, def?: string) => (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={`c_${f}`}>{label}</label>
        {def !== undefined && !locked && parts[f] !== def && (
          <button className="text-[12px] font-medium" style={{ color: "var(--focus)" }} onClick={() => set(f, def)}>Use default</button>
        )}
      </div>
      <textarea id={`c_${f}`} className="field" rows={rows} value={parts[f]} readOnly={locked} onBlur={flush} onChange={(e) => set(f, e.target.value)}
        placeholder={f === "comment" ? "Your take on this post" : def === "" ? "Set a default in Settings" : undefined} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold text-[13px]">Caption</h2>
      {field("comment", "1. About this post", 4)}
      {field("tradr", "2. About Tradr", 3, defs.tradr)}
      {field("hashtags", "3. Hashtags", 2, defs.hashtags)}
      <div>
        <div className="flex items-center justify-between">
          <span className="label">Full caption</span>
          <button className="btn small ghost" onClick={async () => toast((await copyText(cap)) ? "Caption copied." : "Copy failed.", { ms: 2000 })}><Icon name="copy" size={14} /> Copy</button>
        </div>
        <pre className="rounded-lg border p-3 whitespace-pre-wrap text-[13px] max-h-[260px] overflow-auto font-[inherit]" style={{ background: "var(--soft)", borderColor: "var(--line)" }}>{cap || " "}</pre>
        <div className="flex gap-4 mt-1.5 text-[12px] muted">
          <span style={chars > CAPTION_MAX ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{chars.toLocaleString()} / {CAPTION_MAX.toLocaleString()} characters</span>
          <span style={tags > HASHTAG_MAX ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{tags} / {HASHTAG_MAX} hashtags</span>
        </div>
      </div>
    </div>
  );
}

function Notes({ post, save }: { post: Post; save: (id: string, patch: Parameters<typeof patchPost>[1]) => Promise<void> }) {
  const { data: inspo } = useSWR<Inspo[]>(post.inspoId ? "/api/inspo" : null, fetcher);
  const item = inspo?.find((i) => i.id === post.inspoId);
  const [notes, setNotes] = useState(post.notes);
  return (
    <section className="grid md:grid-cols-[1fr_280px] gap-4">
      <div className="card p-3 md:p-4">
        <label className="label" htmlFor="p_notes">Notes (only for you)</label>
        <textarea id="p_notes" className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== post.notes && save(post.id, { notes })} />
      </div>
      {post.inspoId && (
        <Link href={`/inspo?open=${post.inspoId}`} className="card p-3 flex gap-3 items-center hover:border-[var(--line-2)]">
          <div className="thumb w-12 aspect-[4/5] rounded-md flex-none" style={item?.images[0] ? { backgroundImage: `url("${item.images[0].url}")` } : undefined} />
          <div className="min-w-0">
            <div className="text-[12px] muted">Inspired by</div>
            <div className="font-semibold truncate">{item?.username ? `@${item.username}` : "Inspo item"}</div>
          </div>
        </Link>
      )}
    </section>
  );
}

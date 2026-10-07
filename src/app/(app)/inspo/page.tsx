"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { PageHeader, Sheet, Spinner, Warn, n } from "@/components/ui";
import { ConfirmButton } from "@/components/publish";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client/api";
import { createPost, useAppState } from "@/lib/client/state";
import { imageFiles, toJpeg, uploadBlob } from "@/lib/client/upload";
import type { Inspo, InspoStatus } from "@/lib/types";

const KEY = "/api/inspo";
const STATUSES: [InspoStatus, string][] = [["todo", "To do"], ["skip", "No"], ["done", "Done"]];
const STATUS_COLOR: Record<InspoStatus, string> = { todo: "var(--s-scheduled)", skip: "var(--s-draft)", done: "var(--s-posted)" };

async function uploadScreens(files: File[]) {
  const out: Inspo["images"] = [];
  for (const f of files) {
    const { blob, w, h } = await toJpeg(f, 0.88);
    out.push({ url: await uploadBlob(blob, `inspo/${crypto.randomUUID()}.jpg`), w, h });
  }
  return out;
}

const upsert = (item: Inspo) => mutate<Inspo[]>(KEY, (xs) => (xs ? (xs.some((x) => x.id === item.id) ? xs.map((x) => (x.id === item.id ? item : x)) : [item, ...xs]) : [item]), { revalidate: false });

export default function InspoPage() {
  return <Suspense><Inspo_ /></Suspense>;
}

function Inspo_() {
  const { data: items, error } = useSWR<Inspo[]>(KEY, fetcher);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<InspoStatus | "all">("todo");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const openId = params.get("open");

  const add = useCallback(async (opts: { files?: File[] }) => {
    if (!url.trim() && !opts.files?.length) return;
    setBusy(opts.files ? "upload" : "fetch");
    try {
      const images = opts.files?.length ? await uploadScreens(opts.files) : undefined;
      const r = await api<{ item: Inspo; duplicate?: boolean }>(KEY, { body: { url: url.trim() || undefined, username: user.trim() || undefined, images } });
      await upsert(r.item);
      if (r.duplicate) toast("You already saved this one.");
      else if (r.item.fetchError) toast(r.item.fetchError, { tone: "error" });
      setUrl("");
      setUser("");
      router.replace(`/inspo?open=${r.item.id}`, { scroll: false });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(null);
    }
  }, [url, user, toast, router]);

  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea") || openId) return;
      const files = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()!).filter(Boolean);
      if (files.length) {
        e.preventDefault();
        add({ files });
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add, openId]);

  const tags = useMemo(() => [...new Set((items || []).flatMap((i) => i.tags))].sort(), [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || [])
      .filter((i) => status === "all" || i.status === status)
      .filter((i) => !tag || i.tags.includes(tag))
      .filter((i) => !s || [i.caption, i.username, i.notes, ...i.tags].join(" ").toLowerCase().includes(s))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, status, tag, q]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map(([s]) => [s, (items || []).filter((i) => i.status === s).length])), [items]);

  const setItemStatus = async (it: Inspo, s: InspoStatus) => {
    await upsert({ ...it, status: s });
    try {
      await upsert(await api<Inspo>(`${KEY}/${it.id}`, { method: "PATCH", body: { status: s } }));
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
      mutate(KEY);
    }
  };
  const open = items?.find((i) => i.id === openId) || null;

  return (
    <div>
      <PageHeader title="Inspo" sub="Paste an Instagram link, or drop a screenshot. Mark each one: to do, no, or done." />
      <div className="px-4 md:px-6 flex flex-col gap-3">
        <form className="card p-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); add({}); }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = imageFiles(e.dataTransfer.files); if (f.length) add({ files: f }); }}>
          <input className="field flex-[3_1_260px]" type="url" inputMode="url" placeholder="https://www.instagram.com/p/…" value={url} onChange={(e) => {
            setUrl(e.target.value);
            const m = e.target.value.match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:p|reel|tv)\//);
            if (m) setUser(m[1]);
          }} aria-label="Instagram link" />
          <input className="field flex-[1_1_140px]" placeholder="@account" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Account username" autoCapitalize="none" autoCorrect="off" />
          <button className="btn primary" disabled={!!busy || !url.trim()}>{busy === "fetch" ? <><Spinner /> Fetching…</> : "Fetch"}</button>
          <label className="btn cursor-pointer">
            {busy === "upload" ? <><Spinner /> Uploading…</> : "Add screenshot"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = imageFiles(e.target.files); e.target.value = ""; if (f.length) add({ files: f }); }} />
          </label>
          <p className="basis-full text-[12px] muted">Links shared from the Instagram app don’t include the account, so type the @account to fetch it. A screenshot always works, and you can paste one with ⌘V.</p>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Status">
            {STATUSES.map(([s, l]) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{l} <span className="opacity-60">{counts[s] || 0}</span></button>)}
            <button aria-pressed={status === "all"} onClick={() => setStatus("all")}>All</button>
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-[320px]">
            <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
            <input type="search" className="field !pl-8 !bg-[var(--panel)]" placeholder="Search captions, accounts, tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </div>
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1.5 scroll-x">
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)} className="flex-none rounded-full border px-2.5 py-0.5 text-[12px] font-medium"
                style={tag === t ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : { borderColor: "var(--line)", background: "var(--panel)" }}>#{t}</button>
            ))}
          </div>
        )}

        {error && !items && <div role="alert">Couldn’t load: {error.message}</div>}
        {!items && !error && <div className="flex items-center gap-2 muted py-6"><Spinner /> Loading…</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-10">
          {shown.map((it) => (
            <article key={it.id} className="card overflow-hidden flex flex-col">
              <button className="text-left" onClick={() => router.replace(`/inspo?open=${it.id}`, { scroll: false })}>
                <div className="thumb aspect-[4/5] relative flex items-center justify-center text-[12px] text-[#999]" style={it.images[0] ? { backgroundImage: `url("${it.images[0].url}")` } : undefined}>
                  {!it.images[0] && (it.fetchError ? "No preview yet" : "Instagram post")}
                  {it.images.length > 1 && <span className="absolute top-1.5 right-1.5 text-[10.5px] font-bold text-white bg-black/60 rounded px-1.5">1/{it.images.length}</span>}
                  {it.postId && <span className="absolute bottom-1.5 left-1.5 text-[10.5px] font-bold text-white rounded px-1.5" style={{ background: "var(--s-posted)" }}>Has post</span>}
                </div>
                <div className="px-2.5 pt-2">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold truncate flex-1">{it.username ? `@${it.username}` : <span className="muted">Unknown account</span>}</span>
                    {it.likes != null && <span className="muted tabular-nums">♥ {n(it.likes)}</span>}
                  </div>
                  <p className="text-[12px] muted line-clamp-2 mt-0.5 min-h-[2.6em]">{it.caption || it.notes || ""}</p>
                </div>
              </button>
              <div className="px-2.5 pb-2.5 pt-1.5 mt-auto">
                <div className="seg w-full" role="group" aria-label="Status">
                  {STATUSES.map(([s, l]) => (
                    <button key={s} className="flex-1 !px-1" aria-pressed={it.status === s} onClick={() => setItemStatus(it, s)}
                      style={it.status === s ? { background: STATUS_COLOR[s], color: "#fff" } : undefined}>{l}</button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        {items && !shown.length && <div className="muted text-center py-10">Nothing here{status !== "all" ? ` marked “${STATUSES.find((s) => s[0] === status)?.[1]}”` : ""}.</div>}
      </div>
      <Sheet open={!!open} onClose={() => router.replace("/inspo", { scroll: false })} label="Inspo" wide>
        {open && <Detail it={open} onClose={() => router.replace("/inspo", { scroll: false })} setStatus={setItemStatus} />}
      </Sheet>
    </div>
  );
}

function Detail({ it, onClose, setStatus }: { it: Inspo; onClose: () => void; setStatus: (it: Inspo, s: InspoStatus) => void }) {
  const toast = useToast();
  const router = useRouter();
  const { data } = useAppState();
  const [notes, setNotes] = useState(it.notes);
  const [tagIn, setTagIn] = useState("");
  const [user, setUser] = useState(it.username || "");
  const [busy, setBusy] = useState<string | null>(null);
  const linked = data?.posts.find((p) => p.id === it.postId);

  const patch = async (body: Partial<Inspo>) => {
    try {
      await upsert(await api<Inspo>(`${KEY}/${it.id}`, { method: "PATCH", body }));
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const refetch = async () => {
    setBusy("fetch");
    try {
      const r = await api<Inspo>(`${KEY}/${it.id}/refetch`, { body: { username: user } });
      await upsert(r);
      if (r.fetchError) toast(r.fetchError, { tone: "error" });
      else toast("Fetched.");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  const addShots = async (files: File[]) => {
    setBusy("upload");
    try {
      const imgs = await uploadScreens(files);
      await patch({ images: [...it.images, ...imgs] });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  const makePost = async () => {
    setBusy("post");
    try {
      const title = (it.caption || it.notes || "").split("\n")[0].slice(0, 60) || (it.username ? `From @${it.username}` : "From inspo");
      const p = await createPost({ title, date: null, inspoId: it.id });
      mutate(KEY);
      router.push(`/posts/${p.id}`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
      setBusy(null);
    }
  };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (t && !it.tags.includes(t)) patch({ tags: [...it.tags, t] });
    setTagIn("");
  };

  return (
    <div className="flex flex-col max-h-[calc(100dvh-24px)]">
      <header className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="flex-1 min-w-0 font-bold truncate">{it.username ? `@${it.username}` : "Inspo"}</div>
        {it.url && <a className="btn small" href={it.url} target="_blank" rel="noreferrer">Open <Icon name="ext" size={13} /></a>}
        <button className="btn small ghost" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
      </header>
      <div className="overflow-auto p-4 grid md:grid-cols-[1.1fr_1fr] gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          {it.images.length > 0 ? (
            <div className="flex gap-2 scroll-x snap-x snap-mandatory">
              {it.images.map((im, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={im.url} src={im.url} alt={`Image ${i + 1}`} className="snap-start w-full flex-none rounded-lg object-contain max-h-[60vh]" style={{ background: "#111" }} />
              ))}
            </div>
          ) : it.shortcode ? (
            <iframe title="Instagram post" src={`https://www.instagram.com/p/${it.shortcode}/embed/captioned/`} className="w-full h-[560px] rounded-lg border" style={{ borderColor: "var(--line)", background: "#fff" }} loading="lazy" />
          ) : <div className="muted text-[13px]">No images.</div>}
          <label className="btn small self-start cursor-pointer">
            {busy === "upload" ? <><Spinner /> Uploading…</> : "Add screenshots"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = imageFiles(e.target.files); e.target.value = ""; if (f.length) addShots(f); }} />
          </label>
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          {it.fetchError && <Warn>{it.fetchError}</Warn>}
          <div className="seg" role="group" aria-label="Status">
            {STATUSES.map(([s, l]) => (
              <button key={s} aria-pressed={it.status === s} onClick={() => setStatus(it, s)} style={it.status === s ? { background: STATUS_COLOR[s], color: "#fff" } : undefined}>{l}</button>
            ))}
          </div>
          {(it.likes != null || it.comments != null) && (
            <div className="flex gap-4 text-[13px]"><span>♥ <b>{n(it.likes)}</b> likes</span><span><b>{n(it.comments)}</b> comments</span>{it.postedAt && <span className="muted">{new Date(it.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}</div>
          )}
          {it.caption && <p className="text-[13px] whitespace-pre-wrap max-h-[200px] overflow-auto rounded-lg p-2.5" style={{ background: "var(--soft)" }}>{it.caption}</p>}
          {it.shortcode && (
            <div className="flex gap-2 items-end">
              <div className="flex-1"><label className="label" htmlFor="i_user">Account</label><input id="i_user" className="field" placeholder="@account" value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" /></div>
              <button className="btn" onClick={refetch} disabled={!!busy || !user.trim()}>{busy === "fetch" ? <Spinner /> : null} Fetch again</button>
            </div>
          )}
          <div>
            <span className="label">Tags</span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {it.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]" style={{ borderColor: "var(--line)" }}>
                  #{t}<button aria-label={`Remove ${t}`} className="muted hover:text-[var(--ink)]" onClick={() => patch({ tags: it.tags.filter((x) => x !== t) })}>×</button>
                </span>
              ))}
              <input className="field !w-[140px] !min-h-[28px] !py-1 text-[12px]" placeholder="add tag ↵" value={tagIn} onChange={(e) => setTagIn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagIn); } }} onBlur={() => tagIn && addTag(tagIn)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="i_notes">Notes</label>
            <textarea id="i_notes" className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== it.notes && patch({ notes })} placeholder="Why it works, what you’d change…" />
          </div>
          <div className="flex flex-wrap gap-2 items-center pt-1">
            {linked
              ? <Link className="btn primary" href={`/posts/${linked.id}`}>Open the post: {linked.title || "Untitled"}</Link>
              : <button className="btn primary" onClick={makePost} disabled={!!busy}>{busy === "post" ? <Spinner /> : <Icon name="plus" size={15} />} Make a post from this</button>}
            <span className="flex-1" />
            <ConfirmButton className="btn small danger" confirm="Tap again to delete" onConfirm={async () => {
              await api(`${KEY}/${it.id}`, { method: "DELETE" });
              await mutate<Inspo[]>(KEY, (xs) => xs?.filter((x) => x.id !== it.id), { revalidate: false });
              onClose();
            }}><Icon name="trash" size={14} /></ConfirmButton>
          </div>
        </div>
      </div>
    </div>
  );
}

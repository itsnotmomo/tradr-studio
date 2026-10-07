"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { PageHeader, Sheet, Spinner, n } from "@/components/ui";
import { ConfirmButton, copyText } from "@/components/publish";
import { Markdown } from "@/components/md";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client/api";
import { createPost, useAppState } from "@/lib/client/state";
import { imageFiles, toJpeg, uploadBlob } from "@/lib/client/upload";
import { LANGS } from "@/lib/langs";
import type { Inspo, InspoNotes, InspoStatus, Lang, PlanItem } from "@/lib/types";

const KEY = "/api/inspo";
const PLANS = "/api/plans";
const STATUSES: [InspoStatus, string][] = [["todo", "To do"], ["skip", "No"], ["done", "Done"]];
const STATUS_COLOR: Record<InspoStatus, string> = { todo: "var(--s-scheduled)", skip: "var(--s-draft)", done: "var(--s-posted)" };
const PLAN_LANGS: Lang[] = ["en", "it", "es"];
type Tab = "library" | "plan" | "notes";
type SortKey = "new" | "likes" | "comments";

async function uploadScreens(files: File[]) {
  const out: Inspo["images"] = [];
  for (const f of files) {
    const { blob, w, h } = await toJpeg(f, 0.88);
    out.push({ url: await uploadBlob(blob, `inspo/${crypto.randomUUID()}.jpg`), w, h });
  }
  return out;
}

const upsert = (item: Inspo) =>
  mutate<Inspo[]>(KEY, (xs) => (xs ? (xs.some((x) => x.id === item.id) ? xs.map((x) => (x.id === item.id ? item : x)) : [item, ...xs]) : [item]), { revalidate: false });

export default function InspoPage() {
  return <Suspense><InspoView /></Suspense>;
}

function InspoView() {
  const { data: items, error } = useSWR<Inspo[]>(KEY, fetcher);
  const { data: planData } = useSWR<{ plans: PlanItem[]; notes: InspoNotes }>(PLANS, fetcher);
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "library";
  const openId = params.get("open");
  const go = (q: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(q)) if (v === null) u.delete(k); else u.set(k, v);
    router.replace(`/inspo${u.size ? `?${u}` : ""}`, { scroll: false });
  };
  const toast = useToast();

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
  const plans = planData?.plans || [];
  const plansFor = (id: string) => plans.filter((p) => p.refs.some((r) => r.inspoId === id));

  return (
    <div>
      <PageHeader title="Inspo" sub="Screenshots and reference posts. Mark each one: to do, no, or done.">
        <div className="seg" role="tablist" aria-label="Section">
          {([["library", "Library"], ["plan", "Plan"], ["notes", "Notes"]] as [Tab, string][]).map(([t, l]) => (
            <button key={t} role="tab" aria-pressed={tab === t} aria-selected={tab === t} onClick={() => go({ tab: t === "library" ? null : t })}>{l}</button>
          ))}
        </div>
      </PageHeader>
      {error && !items && <div className="px-6" role="alert">Couldn’t load: {error.message}</div>}
      {tab === "library" && <Library items={items} notes={planData?.notes} plansFor={plansFor} onOpen={(id) => go({ open: id })} setStatus={setItemStatus} />}
      {tab === "plan" && <Plan plans={plans} intro={planData?.notes.planIntro || ""} items={items || []} onOpen={(id) => go({ open: id })} />}
      {tab === "notes" && <Notes notes={planData?.notes} />}
      <Sheet open={!!open} onClose={() => go({ open: null })} label="Inspo" wide>
        {open && <Detail it={open} plans={plansFor(open.id)} onClose={() => go({ open: null })} setStatus={setItemStatus} />}
      </Sheet>
    </div>
  );
}

// ---------------- Library ----------------

function Library({ items, notes, plansFor, onOpen, setStatus }: {
  items: Inspo[] | undefined; notes?: InspoNotes; plansFor: (id: string) => PlanItem[];
  onOpen: (id: string) => void; setStatus: (it: Inspo, s: InspoStatus) => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatusFilter] = useState<InspoStatus | "all">("todo");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("new");

  const add = useCallback(async (files: File[]) => {
    if (!url.trim() && !files.length) return;
    setBusy(true);
    try {
      const images = files.length ? await uploadScreens(files) : undefined;
      const r = await api<{ item: Inspo; duplicate?: boolean }>(KEY, { body: { url: url.trim() || undefined, username: user.trim() || undefined, images } });
      if (r.duplicate && images?.length) {
        // Same post already saved: add the screenshots to it.
        await upsert(await api<Inspo>(`${KEY}/${r.item.id}`, { method: "PATCH", body: { images: [...r.item.images, ...images] } }));
        toast("Added the screenshot to the post you already saved.");
      } else {
        await upsert(r.item);
        if (r.duplicate) toast("You already saved this one.");
      }
      setUrl("");
      setUser("");
      onOpen(r.item.id);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  }, [url, user, toast, onOpen]);

  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,dialog")) return;
      const files = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()!).filter(Boolean);
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const tags = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of items || []) for (const t of i.tags) c.set(t, (c.get(t) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (items || [])
      .filter((i) => status === "all" || i.status === status)
      .filter((i) => !tag || i.tags.includes(tag))
      .filter((i) => !s || [i.description, i.username, i.notes, i.format, ...i.tags].join(" ").toLowerCase().includes(s));
    const v = (i: Inspo) => (sort === "likes" ? i.likes ?? -1 : sort === "comments" ? i.comments ?? -1 : i.createdAt);
    return list.sort((a, b) => v(b) - v(a));
  }, [items, status, tag, q, sort]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map(([s]) => [s, (items || []).filter((i) => i.status === s).length])), [items]);
  const tagNotes = tag ? notes?.accounts.find((a) => a.tag === tag) : null;

  return (
    <div className="px-4 md:px-6 flex flex-col gap-3 pb-10">
      <form className={`card p-3 flex flex-wrap gap-2 items-center ${over ? "drop-on" : ""}`} onSubmit={(e) => { e.preventDefault(); add([]); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = imageFiles(e.dataTransfer.files); if (f.length) add(f); }}>
        <label className="btn primary cursor-pointer">
          {busy ? <><Spinner /> Saving…</> : <><Icon name="plus" size={15} /> Add screenshots</>}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = imageFiles(e.target.files); e.target.value = ""; if (f.length) add(f); }} />
        </label>
        <span className="text-[12px] muted hidden md:inline">or drop / paste them here.</span>
        <span className="basis-full md:basis-auto md:flex-1" />
        <input className="field flex-[3_1_220px]" type="url" inputMode="url" placeholder="Link (optional)" value={url} aria-label="Instagram link"
          onChange={(e) => {
            setUrl(e.target.value);
            const m = e.target.value.match(/instagram\.com\/([A-Za-z0-9._]+)\/(?:p|reel|tv)\//);
            if (m) setUser(m[1]);
          }} />
        <input className="field flex-[1_1_120px]" placeholder="@account" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Account" autoCapitalize="none" autoCorrect="off" />
        <button className="btn" disabled={busy || !url.trim()}>Save link</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label="Status">
          {STATUSES.map(([s, l]) => <button key={s} aria-pressed={status === s} onClick={() => setStatusFilter(s)}>{l} <span className="opacity-60">{counts[s] || 0}</span></button>)}
          <button aria-pressed={status === "all"} onClick={() => setStatusFilter("all")}>All</button>
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 muted" />
          <input type="search" className="field !pl-8 !bg-[var(--panel)]" placeholder="Search descriptions, accounts, tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        <select className="field !w-auto !bg-[var(--panel)]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="likes">Most likes</option>
          <option value="comments">Most comments</option>
        </select>
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1.5 scroll-x">
          {tags.map(([t, c]) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)} className="flex-none rounded-full border px-2.5 py-0.5 text-[12px] font-medium"
              style={tag === t ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : { borderColor: "var(--line)", background: "var(--panel)" }}>
              #{t} <span className="opacity-60">{c}</span>
            </button>
          ))}
        </div>
      )}
      {tagNotes && (
        <details className="card p-3.5" open>
          <summary className="cursor-pointer font-semibold text-[13px]">Notes on {tagNotes.title}</summary>
          <div className="mt-2"><Markdown text={tagNotes.text} /></div>
        </details>
      )}

      {!items && <div className="flex items-center gap-2 muted py-6"><Spinner /> Loading…</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {shown.map((it) => {
          const inPlans = plansFor(it.id);
          return (
            <article key={it.id} className="card overflow-hidden flex flex-col">
              <button className="text-left flex-1 flex flex-col" onClick={() => onOpen(it.id)}>
                {it.images[0] ? (
                  <div className="thumb aspect-[4/5] relative" style={{ backgroundImage: `url("${it.images[0].url}")` }}>
                    {it.images.length > 1 && <span className="absolute top-1.5 right-1.5 text-[10.5px] font-bold text-white bg-black/60 rounded px-1.5">1/{it.images.length}</span>}
                  </div>
                ) : (
                  <div className="aspect-[4/5] p-3 flex flex-col justify-between text-white" style={{ background: "#121212" }}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a85]">{it.format || "Reference"}</span>
                    <p className="text-[13px] leading-snug line-clamp-6 font-medium">{it.description || it.notes || it.url}</p>
                    <span className="text-[11px] text-[#8a8a85]">No screenshot yet</span>
                  </div>
                )}
                <div className="px-2.5 pt-2">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold truncate flex-1">{it.username ? `@${it.username}` : <span className="muted">No account</span>}</span>
                    {it.likes != null && <span className="muted tabular-nums">♥ {n(it.likes)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 min-h-[18px]">
                    {it.postId && <span className="text-[10.5px] font-bold text-white rounded px-1.5" style={{ background: "var(--s-posted)" }}>Has post</span>}
                    {inPlans.map((p) => <span key={p.id} className="text-[10.5px] font-bold rounded px-1.5" style={{ background: "var(--soft)" }}>Plan #{p.number}</span>)}
                  </div>
                </div>
              </button>
              <div className="px-2.5 pb-2.5 pt-1.5">
                <div className="seg w-full" role="group" aria-label="Status">
                  {STATUSES.map(([s, l]) => (
                    <button key={s} className="flex-1 !px-1" aria-pressed={it.status === s} onClick={() => setStatus(it, s)}
                      style={it.status === s ? { background: STATUS_COLOR[s], color: "#fff" } : undefined}>{l}</button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {items && !shown.length && <div className="muted text-center py-10">Nothing here{status !== "all" ? ` marked “${STATUSES.find((s) => s[0] === status)?.[1]}”` : ""}.</div>}
    </div>
  );
}

// ---------------- Detail ----------------

function Detail({ it, plans, onClose, setStatus }: { it: Inspo; plans: PlanItem[]; onClose: () => void; setStatus: (it: Inspo, s: InspoStatus) => void }) {
  const toast = useToast();
  const router = useRouter();
  const { data } = useAppState();
  const [notes, setNotes] = useState(it.notes);
  const [desc, setDesc] = useState(it.description);
  const [user, setUser] = useState(it.username || "");
  const [link, setLink] = useState(it.url || "");
  const [tagIn, setTagIn] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const linked = data?.posts.find((p) => p.id === it.postId);

  const patch = async (body: Partial<Inspo>) => {
    try {
      await upsert(await api<Inspo>(`${KEY}/${it.id}`, { method: "PATCH", body }));
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const addShots = async (files: File[]) => {
    if (!files.length) return;
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
  // Paste a screenshot straight into the open item.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const files = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()!).filter(Boolean);
      if (files.length) {
        e.preventDefault();
        addShots(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  const makePost = async () => {
    setBusy("post");
    try {
      const title = (it.description || it.notes || "").split("\n")[0].slice(0, 60) || (it.username ? `From @${it.username}` : "From inspo");
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
        <div className="flex-1 min-w-0 font-bold truncate">{it.username ? `@${it.username}` : "Inspo"}{it.format && <span className="muted font-medium"> · {it.format}</span>}</div>
        {it.url && <a className="btn small" href={it.url} target="_blank" rel="noreferrer">Open on Instagram <Icon name="ext" size={13} /></a>}
        <button className="btn small ghost" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
      </header>
      <div className="overflow-auto p-4 grid md:grid-cols-[1.1fr_1fr] gap-4">
        <div className={`flex flex-col gap-2 min-w-0 rounded-lg ${over ? "drop-on" : ""}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addShots(imageFiles(e.dataTransfer.files)); }}>
          {it.images.length > 0 ? (
            <div className="flex gap-2 scroll-x snap-x snap-mandatory">
              {it.images.map((im, i) => (
                <div key={im.url} className="snap-start w-full flex-none relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt={`Screenshot ${i + 1}`} className="w-full rounded-lg object-contain max-h-[60vh]" style={{ background: "#111" }} />
                  <button className="absolute top-2 right-2 btn small" onClick={() => patch({ images: it.images.filter((x) => x.url !== im.url) })} aria-label="Remove screenshot"><Icon name="x" size={13} /></button>
                </div>
              ))}
            </div>
          ) : (
            <label className="rounded-lg border-2 border-dashed aspect-[4/5] max-h-[50vh] flex flex-col items-center justify-center gap-1 text-center muted text-[13px] p-4 cursor-pointer" style={{ borderColor: "var(--line-2)" }}>
              <Icon name="plus" size={22} />
              Drop, paste or upload a screenshot
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = imageFiles(e.target.files); e.target.value = ""; addShots(f); }} />
            </label>
          )}
          {it.images.length > 0 && (
            <label className="btn small self-start cursor-pointer">
              {busy === "upload" ? <><Spinner /> Uploading…</> : "Add screenshots"}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = imageFiles(e.target.files); e.target.value = ""; addShots(f); }} />
            </label>
          )}
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          <div className="seg" role="group" aria-label="Status">
            {STATUSES.map(([s, l]) => (
              <button key={s} aria-pressed={it.status === s} onClick={() => setStatus(it, s)} style={it.status === s ? { background: STATUS_COLOR[s], color: "#fff" } : undefined}>{l}</button>
            ))}
          </div>
          {(it.likes != null || it.comments != null) && (
            <div className="flex gap-4 text-[13px]"><span>♥ <b>{n(it.likes)}</b> likes</span><span><b>{n(it.comments)}</b> comments</span></div>
          )}
          <div>
            <label className="label" htmlFor="i_desc">What it is</label>
            <textarea id="i_desc" className="field" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== it.description && patch({ description: desc })} />
          </div>
          <div className="grid grid-cols-[1.6fr_1fr] gap-2">
            <div><label className="label" htmlFor="i_link">Link</label><input id="i_link" className="field" type="url" value={link} onChange={(e) => setLink(e.target.value)} onBlur={() => link !== (it.url || "") && patch({ url: link })} /></div>
            <div><label className="label" htmlFor="i_user">Account</label><input id="i_user" className="field" placeholder="@account" value={user} onChange={(e) => setUser(e.target.value)} onBlur={() => user !== (it.username || "") && patch({ username: user })} autoCapitalize="none" /></div>
          </div>
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
          {plans.length > 0 && (
            <div className="text-[12.5px]">
              <span className="label">In the plan</span>
              {plans.map((p) => (
                <div key={p.id} className="rounded-lg px-2.5 py-1.5 mb-1" style={{ background: "var(--soft)" }}>
                  <b>#{p.number} {p.type}</b> · {p.texts.en}
                  {p.refs.find((r) => r.inspoId === it.id)?.note && <div className="muted mt-0.5">Take: {p.refs.find((r) => r.inspoId === it.id)!.note}</div>}
                </div>
              ))}
            </div>
          )}
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

// ---------------- Plan ----------------

function Plan({ plans, intro, items, onOpen }: { plans: PlanItem[]; intro: string; items: Inspo[]; onOpen: (id: string) => void }) {
  const toast = useToast();
  const router = useRouter();
  const { data } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = [...new Set(plans.map((p) => p.group))];

  const makePost = async (p: PlanItem) => {
    setBusy(p.id);
    try {
      // Slide text stays out of the caption: captions are written by hand.
      const post = await createPost({ title: p.texts.en.slice(0, 80), date: null, planId: p.id, inspoId: p.refs[0]?.inspoId });
      mutate(PLANS);
      mutate(KEY);
      router.push(`/posts/${post.id}`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
      setBusy(null);
    }
  };

  if (!plans.length) return <div className="px-6 muted py-10 text-center">No plan yet.</div>;
  return (
    <div className="px-4 md:px-6 pb-10 flex flex-col gap-4 max-w-[1100px]">
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-3">
          <div>
            <h2 className="font-bold text-[16px]">{g}</h2>
            {intro && <p className="text-[13px] muted">{intro}</p>}
          </div>
          {plans.filter((p) => p.group === g).map((p) => {
            const post = data?.posts.find((x) => x.id === p.postId);
            return (
              <article key={p.id} className="card p-3.5 md:p-4 flex flex-col gap-3">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[15px]">#{p.number}</span>
                  <span className="pill s-ready" style={{ ["--s" as string]: "var(--ink-2)" }}>{p.type}</span>
                  <span className="flex-1" />
                  {post
                    ? <Link className="btn small" href={`/posts/${post.id}`}>Open post: {post.title || "Untitled"}</Link>
                    : <>
                      <Link className="btn small" href={`/tools/tweet?plan=${p.id}`}><Icon name="tweet" size={14} /> Tweet card</Link>
                      <button className="btn small primary" onClick={() => makePost(p)} disabled={busy === p.id}>{busy === p.id ? <Spinner /> : <Icon name="plus" size={14} />} Make post</button>
                    </>}
                </header>
                <div className="grid md:grid-cols-3 gap-2">
                  {PLAN_LANGS.map((k) => (
                    <div key={k} className="rounded-lg p-2.5 text-[13px] flex flex-col gap-1.5" style={{ background: "var(--soft)" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold muted">{LANGS.find((l) => l.k === k)!.code} · slide text</span>
                        <button className="btn small ghost !min-h-[22px] !px-1" aria-label={`Copy ${k} text`} onClick={async () => toast((await copyText(p.texts[k])) ? "Copied." : "Copy failed.", { ms: 1500 })}><Icon name="copy" size={13} /></button>
                      </div>
                      <p className="whitespace-pre-wrap">{p.texts[k]}</p>
                    </div>
                  ))}
                </div>
                {p.refs.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="label">References</span>
                    {p.refs.map((r) => {
                      const it = byId.get(r.inspoId);
                      if (!it) return null;
                      return (
                        <button key={r.inspoId} onClick={() => onOpen(it.id)} className="text-left rounded-lg px-2.5 py-2 text-[12.5px] flex flex-wrap gap-x-3 gap-y-0.5 items-baseline hover:bg-[var(--soft)] border" style={{ borderColor: "var(--line)" }}>
                          <b>@{it.username}</b>
                          <span className="flex-1 min-w-[200px]">{it.description}</span>
                          <span className="muted tabular-nums">♥ {n(it.likes)}</span>
                          {r.note && <span className="basis-full muted">Take: {r.note}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ---------------- Notes ----------------

function Notes({ notes }: { notes?: InspoNotes }) {
  if (!notes) return <div className="px-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;
  return (
    <div className="px-4 md:px-6 pb-10 flex flex-col gap-4 max-w-[900px]">
      {notes.intro && <section className="card p-4"><Markdown text={notes.intro} /></section>}
      {notes.accounts.map((a) => (
        <section key={a.tag} className="card p-4">
          <h2 className="font-bold text-[15px] mb-2">{a.title}</h2>
          <Markdown text={a.text} />
        </section>
      ))}
      {!notes.intro && !notes.accounts.length && <div className="muted text-center py-10">No notes yet.</div>}
    </div>
  );
}

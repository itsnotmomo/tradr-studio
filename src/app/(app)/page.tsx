"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { PostCard, PostCardView, canMove, firstSlide } from "@/components/post-card";
import { PublishControls } from "@/components/publish";
import { Icon } from "@/components/icons";
import { LangDots, Spinner, StatusPill } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createPost, patchPost, useAppState, type AppState } from "@/lib/client/state";
import { buildCaption } from "@/lib/caption";
import { displayStatus, STATUS_LABEL } from "@/lib/status";
import { LANGS, LK } from "@/lib/langs";
import { SLOTS, slotName, slotTaken, slotTimes } from "@/lib/slots";
import { addDays, fmtDate, parseYmd, weekStart, ymd } from "@/lib/time";
import type { DisplayStatus, Lang, Post, Settings, Slot } from "@/lib/types";

type View = "day" | "week" | "month";
type Filter = Lang | "all";
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const byTime = (a: Post, b: Post) => (a.slot === b.slot ? 0 : a.slot === "morning" ? -1 : 1) || a.createdAt - b.createdAt;


/** md breakpoint, so each post is rendered (and registered as draggable) exactly once. */
function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia("(min-width: 768px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia("(min-width: 768px)").matches,
    () => true,
  );
}

function usePersisted<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setV(JSON.parse(raw));
    } catch {
      /* private mode */
    }
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, JSON.stringify(x));
    } catch {
      /* ignore */
    }
  };
  return [v, set] as const;
}

export default function PlannerPage() {
  const { data, error } = useAppState();
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = usePersisted<View>("studio.view", "week");
  const [filter, setFilter] = usePersisted<Filter>("studio.filter", "all");
  const [cursor, setCursor] = useState(() => new Date());
  const [dragId, setDragId] = useState<string | null>(null);
  const justDragged = useRef(0);

  // Mouse drags after 6 px; touch needs a long press so swiping still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of data?.posts || []) if (p.date) m.set(p.date, [...(m.get(p.date) || []), p]);
    for (const list of m.values()) list.sort(byTime);
    return m;
  }, [data?.posts]);
  const ideas = useMemo(() => (data?.posts || []).filter((p) => !p.date).sort((a, b) => b.createdAt - a.createdAt), [data?.posts]);

  if (error && !data) return <div className="p-6" role="alert">Couldn’t load: {error.message}</div>;
  if (!data) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;

  const days = rangeDays(view, cursor);
  const shown = days.flatMap((d) => byDay.get(d) || []);
  const shift = (n: number) =>
    setCursor((c) => (view === "month" ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * (view === "week" ? 7 : 1))));

  const newPost = async (date: string | null, slot?: Slot) => {
    try {
      const p = await createPost({ date, slot });
      router.push(`/posts/${p.id}`);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setDragId(null);
    justDragged.current = Date.now();
    const id = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const p = data.posts.find((x) => x.id === id);
    if (!p) return;
    let date: string | null = null, slot: Slot = p.slot;
    if (over !== "ideas") {
      const [, d, sl] = over.split(":");
      date = d;
      // Dropped on a whole day (month view on a phone): first free slot.
      slot = (sl as Slot) || (SLOTS.map((x) => x.k).find((x) => !slotTaken(data.posts, d, x, id)) ?? "morning");
    }
    if (p.date === date && (!date || p.slot === slot)) return;
    const other = date ? slotTaken(data.posts, date, slot, id) : null;
    if (other) {
      toast(`${slotName(slot)} on ${fmtDate(date!, { weekday: "short", day: "numeric", month: "short" })} is taken by “${other.title || "Untitled"}”. Each account posts at most once per slot.`, { tone: "error" });
      return;
    }
    try {
      const r = await patchPost(id, { date, slot });
      const note = r.notes.join(" ");
      toast(date ? `Moved to ${slotName(slot)}, ${fmtDate(date, { weekday: "short", day: "numeric", month: "short" })}. ${note}` : `Moved to Ideas. ${note}`);
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    }
  };
  // A drag ends with a click on the card underneath; swallow it.
  const swallowClick = (e: React.MouseEvent) => {
    if (Date.now() - justDragged.current < 250) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const dragged = dragId ? data.posts.find((p) => p.id === dragId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)} autoScroll>
      <div onClickCapture={swallowClick}>
        <Toolbar view={view} setView={setView} filter={filter} setFilter={setFilter} cursor={cursor} shift={shift}
          today={() => setCursor(new Date())} label={rangeLabel(view, cursor)} onNew={() => newPost(view === "day" ? ymd(cursor) : ymd(new Date()))}
          summary={<Summary posts={shown} filter={filter} />} />
        <div className={view === "day" ? "" : "lg:grid lg:grid-cols-[1fr_250px]"}>
          <div className="px-3 md:px-6 pb-10 pt-1 min-w-0">
            {view === "month" && <Month cursor={cursor} byDay={byDay} filter={filter} onNew={newPost} onPick={(d) => { setCursor(parseYmd(d)); setView("day"); }} />}
            {view === "week" && <Week cursor={cursor} byDay={byDay} filter={filter} onNew={newPost} settings={data.settings} />}
            {view === "day" && <Day date={ymd(cursor)} posts={byDay.get(ymd(cursor)) || []} filter={filter} data={data} onNew={newPost} />}
          </div>
          {view !== "day" && <IdeasPanel ideas={ideas} filter={filter} onNew={() => newPost(null)} />}
        </div>
      </div>
      {/* Portalled to <body> so no ancestor can offset the preview; it follows the pointer. */}
      {typeof document !== "undefined" && createPortal(
        <DragOverlay dropAnimation={null} zIndex={60}>
          {dragged && <div className="w-[150px] rotate-2 shadow-xl pointer-events-none"><PostCardView post={dragged} lang={filter} /></div>}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function rangeDays(view: View, c: Date) {
  if (view === "day") return [ymd(c)];
  if (view === "week") return [...Array(7)].map((_, i) => ymd(addDays(weekStart(c), i)));
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const n = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
  return [...Array(n)].map((_, i) => ymd(addDays(first, i)));
}

function rangeLabel(view: View, c: Date) {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", o);
  if (view === "month") return f(c, { month: "long", year: "numeric" });
  if (view === "day") return f(c, { weekday: "long", day: "numeric", month: "long" });
  const s = weekStart(c), e = addDays(s, 6);
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()}–${e.getDate()} ${f(e, { month: "short", year: "numeric" })}`
    : `${f(s, { day: "numeric", month: "short" })} – ${f(e, { day: "numeric", month: "short" })}`;
}

function Toolbar(p: {
  view: View; setView: (v: View) => void; filter: Filter; setFilter: (f: Filter) => void; cursor: Date;
  shift: (n: number) => void; today: () => void; label: string; onNew: () => void; summary: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b px-3 md:px-6 py-2.5 md:py-3 flex flex-wrap items-center gap-2 md:gap-3" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(10px)", borderColor: "var(--line)" }}>
      <div className="flex items-center gap-1">
        <button className="btn small ghost" onClick={() => p.shift(-1)} aria-label="Previous"><Icon name="left" size={16} /></button>
        <button className="btn small" onClick={p.today}>Today</button>
        <button className="btn small ghost" onClick={() => p.shift(1)} aria-label="Next"><Icon name="right" size={16} /></button>
      </div>
      <h1 className="text-[16px] md:text-[18px] font-bold tracking-tight min-w-[150px] flex-1 md:flex-none">{p.label}</h1>
      <div className="seg" role="group" aria-label="View">
        {(["day", "week", "month"] as View[]).map((v) => (
          <button key={v} aria-pressed={p.view === v} onClick={() => p.setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Account">
        <button aria-pressed={p.filter === "all"} onClick={() => p.setFilter("all")}>All</button>
        {LANGS.map((l) => (
          <button key={l.k} aria-pressed={p.filter === l.k} onClick={() => p.setFilter(l.k)} title={l.handle}>{l.code}</button>
        ))}
      </div>
      <div className="hidden xl:flex flex-1">{p.summary}</div>
      <button className="btn primary ml-auto" onClick={p.onNew}><Icon name="plus" size={16} /> <span className="hidden sm:inline">New post</span></button>
    </div>
  );
}

function Summary({ posts, filter }: { posts: Post[]; filter: Filter }) {
  const ks = filter === "all" ? LK : [filter];
  const c: Partial<Record<DisplayStatus, number>> = {};
  for (const p of posts) for (const k of ks) {
    const s = displayStatus(p.variants[k]);
    c[s] = (c[s] || 0) + 1;
  }
  return (
    <div className="flex items-center gap-3 text-[12px] muted">
      <span>{posts.length} post{posts.length === 1 ? "" : "s"}</span>
      {(["draft", "ready", "scheduled", "posted", "failed"] as DisplayStatus[]).filter((s) => c[s]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5"><i className={`dot s-${s}`} />{c[s]} {STATUS_LABEL[s].toLowerCase()}</span>
      ))}
    </div>
  );
}

function SlotDrop({ date, slot, children, className, style }: { date: string; slot?: Slot; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id: slot ? `slot:${date}:${slot}` : `day:${date}` });
  return <div ref={setNodeRef} className={`${className || ""} ${isOver ? "drop-on" : ""}`} style={style}>{children}</div>;
}

const inSlot = (list: Post[], slot: Slot) => list.filter((p) => p.slot === slot);

function Week({ cursor, byDay, filter, onNew, settings }: { cursor: Date; byDay: Map<string, Post[]>; filter: Filter; onNew: (d: string, s?: Slot) => void; settings: Settings }) {
  const s = weekStart(cursor), t = ymd(new Date());
  const only = filter === "all" ? undefined : [filter];
  const desktop = useDesktop();
  return (
    <div className="mt-3">
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {[...Array(7)].map((_, i) => {
          const d = addDays(s, i), k = ymd(d), list = byDay.get(k) || [];
          const isToday = k === t;
          return (
            <div key={k} className="rounded-xl border p-2 flex flex-col gap-1.5 min-w-0" style={{ background: "var(--panel)", borderColor: isToday ? "var(--ink)" : "var(--line)" }}>
              <header className="text-[12px] font-semibold muted px-0.5">
                <b className="text-[18px] mr-1" style={{ color: "var(--ink)" }}>{d.getDate()}</b>
                {d.toLocaleDateString("en-GB", { weekday: "short" })}
                {isToday && <span className="ml-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--ink)" }}>Today</span>}
              </header>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                {SLOTS.map(({ k: slot, name }) => {
                  const here = inSlot(list, slot);
                  return (
                    <SlotDrop key={slot} date={k} slot={slot} className="group rounded-lg border border-dashed p-1.5 flex flex-col gap-1.5 md:min-h-[200px] min-w-0" style={{ borderColor: "var(--line)", background: "var(--soft)" }}>
                      <div className="flex items-center justify-between gap-1" title={slotTimes(settings, slot)}>
                        <span className="text-[11px] font-bold uppercase tracking-wide muted">{name}</span>
                        {!here.length && <button className="btn small ghost !min-h-[22px] !px-1 md:opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => onNew(k, slot)} aria-label={`New post, ${name} ${k}`}><Icon name="plus" size={14} /></button>}
                      </div>
                      <div className="text-[10px] muted -mt-1 truncate">{slotTimes(settings, slot, only)}</div>
                      <div className="flex flex-col gap-1.5">
                        {here.map((p) => <PostCard key={p.id} post={p} lang={filter} variant={desktop ? "card" : "row"} />)}
                        {!here.length && <span className="md:hidden text-[11.5px] muted px-0.5 pb-0.5">Free</span>}
                      </div>
                    </SlotDrop>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Month({ cursor, byDay, filter, onNew, onPick }: { cursor: Date; byDay: Map<string, Post[]>; filter: Filter; onNew: (d: string, s?: Slot) => void; onPick: (d: string) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = weekStart(first);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const end = addDays(weekStart(last), 6);
  const t = ymd(new Date());
  const cells: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  const ks = filter === "all" ? LK : [filter];
  const desktop = useDesktop();
  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 gap-1 md:gap-1.5 mb-1.5 text-[11px] md:text-[12px] font-semibold muted px-1">{DOW.map((x) => <span key={x}>{x}</span>)}</div>
      <div className="grid grid-cols-7 gap-1 md:gap-1.5">
        {cells.map((d) => {
          const k = ymd(d), out = d.getMonth() !== first.getMonth(), list = byDay.get(k) || [];
          return (
            <div key={k} className="rounded-lg border p-1 md:p-1.5 min-h-[64px] md:min-h-[118px] flex flex-col gap-1 min-w-0"
              style={{ background: out ? "transparent" : "var(--panel)", borderColor: k === t ? "var(--ink)" : "var(--line)", borderStyle: out ? "dashed" : "solid" }}>
              <button className="text-[12px] font-semibold px-1 rounded self-start" style={k === t ? { background: "var(--accent)", color: "var(--accent-ink)" } : { color: "var(--muted)" }} onClick={() => onPick(k)}>{d.getDate()}</button>
              {desktop && <div className="flex flex-col gap-1">
                {SLOTS.map(({ k: slot }) => {
                  const here = inSlot(list, slot);
                  return (
                    <SlotDrop key={slot} date={k} slot={slot} className="group rounded-md min-h-[34px] flex flex-col gap-1 p-0.5" style={{ background: "var(--soft)" }}>
                      {here.map((p) => <PostCard key={p.id} post={p} lang={filter} variant="chip" />)}
                      {!here.length && (
                        <button className="text-[10.5px] muted text-left px-1 py-1 opacity-60 group-hover:opacity-100" onClick={() => onNew(k, slot)}>
                          {slot === "morning" ? "AM" : "PM"} <span className="opacity-0 group-hover:opacity-100">+ new</span>
                        </button>
                      )}
                    </SlotDrop>
                  );
                })}
              </div>}
              {!desktop && <SlotDrop date={k} className="flex-1">
                <button className="w-full h-full flex flex-col gap-[3px] px-0.5 text-left" onClick={() => onPick(k)} aria-label={`${list.length} posts`}>
                  {SLOTS.map(({ k: slot }) => (
                    <span key={slot} className="flex gap-[3px] items-center h-[7px]">
                      {inSlot(list, slot).flatMap((p) => ks.map((kk) => <i key={p.id + kk} className={`dot s-${displayStatus(p.variants[kk])}`} style={{ width: 7, height: 7 }} />))}
                    </span>
                  ))}
                </button>
              </SlotDrop>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Day({ date, posts, filter, data, onNew }: { date: string; posts: Post[]; filter: Filter; data: AppState; onNew: (d: string, s?: Slot) => void }) {
  const ks = filter === "all" ? LK : [filter];
  return (
    <div className="mt-3 flex flex-col gap-4 max-w-[1200px]">
      {SLOTS.map(({ k: slot, name }) => {
        const here = inSlot(posts, slot);
        return (
          <SlotDrop key={slot} date={date} slot={slot} className="flex flex-col gap-2 rounded-xl">
            <h2 className="flex flex-wrap items-baseline gap-x-3 px-1">
              <span className="font-bold text-[15px]">{name}</span>
              <span className="text-[12px] muted">{slotTimes(data.settings, slot, filter === "all" ? undefined : [filter])}</span>
            </h2>
            {!here.length && (
              <div className="rounded-xl border-2 border-dashed p-6 text-center muted text-[13px]" style={{ borderColor: "var(--line)" }}>
                Free. <button className="underline font-semibold" style={{ color: "var(--ink)" }} onClick={() => onNew(date, slot)}>New post</button> or drag one here.
              </div>
            )}
            {here.map((p) => (
              <section key={p.id} className="card p-3 md:p-4">
                <header className="flex items-center gap-3 mb-3">
                  <DayHandle post={p} />
                  <Link href={`/posts/${p.id}`} className="btn">Edit</Link>
                </header>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                  {ks.map((k) => <DayLang key={k} post={p} k={k} data={data} />)}
                </div>
              </section>
            ))}
          </SlotDrop>
        );
      })}
    </div>
  );
}

/** Day view header: thumbnail + title. Drag it to another slot, day or Ideas. */
function DayHandle({ post }: { post: Post }) {
  const movable = canMove(post);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id, disabled: !movable });
  const s = firstSlide(post);
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`flex items-center gap-3 flex-1 min-w-0 ${movable ? "cursor-grab" : ""}`}
      style={{ opacity: isDragging ? 0.35 : 1, WebkitTouchCallout: "none", userSelect: "none", touchAction: "manipulation" }}
      title={movable ? "Drag to another slot or day" : undefined}>
      <div className="thumb w-10 aspect-[4/5] rounded-md flex-none" style={s ? { backgroundImage: `url("${s.url}")` } : undefined} />
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-[15px] truncate">{post.title || "Untitled"}</h3>
        <LangDots post={post} />
      </div>
    </div>
  );
}

function DayLang({ post, k, data }: { post: Post; k: Lang; data: AppState }) {
  const v = post.variants[k];
  const l = LANGS.find((x) => x.k === k)!;
  const end = data.settings.langs[k].tradrSlide;
  const cap = buildCaption(v);
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2.5" style={{ background: "var(--soft)", borderColor: "var(--line)" }}>
      <div className="flex items-center gap-2">
        <span className="font-bold text-[13px]">{l.name}</span>
        <span className="text-[12px] muted flex-1 truncate">{l.handle}</span>
        <StatusPill s={displayStatus(v)} />
      </div>
      <div className="flex gap-1.5 scroll-x">
        {v.slides.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.id} src={s.url} alt={`Slide ${i + 1}`} className="w-14 aspect-[4/5] object-cover rounded flex-none" />
        ))}
        {end
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={end.url} alt="Tradr slide" className="w-14 aspect-[4/5] object-cover rounded flex-none ring-2 ring-[var(--s-posted)]" />
          : <div className="w-14 aspect-[4/5] rounded flex-none flex items-center justify-center text-[9px] text-center text-[#888] p-1" style={{ background: "#1a1a1a" }}>Tradr slide missing</div>}
      </div>
      <div className="text-[12px] whitespace-pre-wrap max-h-[88px] overflow-hidden" style={{ color: "var(--ink-2)" }}>{cap || <span className="muted">No caption yet.</span>}</div>
      <PublishControls post={post} k={k} data={data} compact />
    </div>
  );
}

function IdeasPanel({ ideas, filter, onNew }: { ideas: Post[]; filter: Filter; onNew: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: "ideas" });
  return (
    <aside className="hidden lg:block border-l px-3 py-4 sticky top-[57px] self-start max-h-[calc(100dvh-57px)] overflow-auto" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-[13px]">Ideas</h2>
        <button className="btn small ghost" onClick={onNew} aria-label="New idea"><Icon name="plus" size={15} /></button>
      </div>
      <p className="text-[12px] muted mb-2.5">No date yet. Drag onto a day, or drag a post here to unschedule it.</p>
      <div ref={setNodeRef} className={`flex flex-col gap-1.5 min-h-[140px] rounded-lg p-1 ${isOver ? "drop-on" : ""}`}>
        {ideas.map((p) => <PostCard key={p.id} post={p} lang={filter} variant="row" />)}
        {!ideas.length && <span className="text-[12px] muted p-1.5">No ideas yet.</span>}
      </div>
    </aside>
  );
}

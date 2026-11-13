"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { useAppState } from "@/lib/client/state";
import { api } from "@/lib/client/api";
import { LANGS, LK } from "@/lib/langs";
import { relTime } from "@/lib/time";
import { AUTO_PUBLISH } from "@/lib/features";
import { reelMediaProblems } from "@/lib/reel";

// Tradr Media: one place for all marketing. Instagram posts (Planner, Inspo), news posts and tweets (News);
// scheduling and posting slot in here later.
const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Planner", icon: "planner" },
  { href: "/news", label: "News", icon: "news" },
  { href: "/inspo", label: "Inspo", icon: "inspo" },
];
/** Phone and portrait-tablet tab bar: the three sections plus Settings. The sidebar starts at 1024 px so a portrait iPad keeps the full width for the Planner. */
const PHONE_TABS = [...NAV, { href: "/settings", label: "Settings", icon: "settings" as IconName }];

const active = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/posts/") || path.startsWith("/go/") : path.startsWith(href));

/** Hides or shows the desktop sidebar and remembers it on this device (as in Tradr HQ). */
function toggleSidebar() {
  const el = document.documentElement;
  const closing = el.dataset.sidebar !== "closed";
  if (closing) el.dataset.sidebar = "closed"; else delete el.dataset.sidebar;
  try { localStorage.setItem("media:sidebar", closing ? "closed" : "open"); } catch { /* still toggles for this visit */ }
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/login";
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const item = (n: { href: string; label: string; icon: IconName }) => (
    <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined}
      className="flex items-center gap-3 h-9 px-2.5 rounded-lg text-[14px] transition text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)] aria-[current=page]:bg-[var(--panel)] aria-[current=page]:text-[var(--ink)] aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <Icon name={n.icon} size={17} />
      <span className="flex-1">{n.label}</span>
    </Link>
  );
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="media-sidebar hidden lg:flex w-[220px] flex-none sticky top-0 h-dvh border-r" style={{ background: "var(--side)", borderColor: "var(--line)" }}>
        <nav aria-label="Sections" className="flex flex-col h-full w-full px-3 pb-3">
          <div className="flex items-center gap-2 px-2 h-14 flex-none">
            <Link href="/" className="serif text-[19px] leading-none">Tradr Media</Link>
            <div className="flex-1" />
            <button className="icon-btn !w-8 !h-8 -mr-1" aria-label="Hide sidebar" title="Hide sidebar (⌘\)" onClick={toggleSidebar}><Icon name="panel" size={16} /></button>
          </div>
          <div className="flex flex-col gap-0.5 mt-1">{NAV.map(item)}</div>
          <div className="flex-1" />
          <div className="flex flex-col gap-0.5">
            {item({ href: "/settings", label: "Settings", icon: "settings" })}
            <button onClick={signOut} className="flex items-center gap-3 h-9 px-2.5 rounded-lg text-[14px] text-left text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]">
              <Icon name="signout" size={17} /> Sign out
            </button>
          </div>
        </nav>
      </aside>
      <button className="media-sidebar-open icon-btn fixed top-3 left-3 z-30" style={{ background: "var(--panel)", border: "1px solid var(--line)" }} aria-label="Show sidebar" title="Show sidebar (⌘\)" onClick={toggleSidebar}>
        <Icon name="panel" size={18} />
      </button>

      <main className="flex-1 min-w-0 pt-safe lg:pt-0 pb-[calc(58px+env(safe-area-inset-bottom))] lg:pb-0">
        <Banners />
        {children}
      </main>

      {/* Phone and portrait-tablet tab bar, as in Tradr HQ */}
      <nav aria-label="Sections" className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t safe-b backdrop-blur" style={{ background: "color-mix(in srgb, var(--panel) 95%, transparent)", borderColor: "var(--line)" }}>
        <div className="grid grid-cols-4 h-[58px] items-center">
          {PHONE_TABS.map((n) => {
            const on = active(path, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 h-full text-[10.5px] ${on ? "text-[var(--ink)] font-medium" : "text-[var(--faint)]"}`}>
                <Icon name={n.icon} size={21} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Loud, app-wide warnings: failed posts and a stalled scheduler. */
function Banners() {
  const { data } = useAppState();
  if (!data) return null;
  const failed = AUTO_PUBLISH ? data.posts.flatMap((p) => LK.filter((k) => p.variants[k].state === "failed").map((k) => ({ p, k }))) : [];
  // Scheduler health lives in Settings → Scheduler, plus a one-time ntfy alert (see lib/server/watchdog).
  const last = data.health.lastTickAt;
  const stalled = AUTO_PUBLISH && data.posts.some((p) => LK.some((k) => p.variants[k].state === "scheduled")) && (!last || data.now - last > 10 * 60_000);
  const brokenAccounts = AUTO_PUBLISH ? LK.filter((k) => data.meta.accounts[k]?.lastError) : [];
  // Reminders use the post name, so planned posts must have one.
  const unnamed = data.posts.filter((p) => p.date && !p.title.trim()).sort((a, b) => a.date!.localeCompare(b.date!));
  // Reels attached before the 1080 × 1920 rule were never refused, so flag any planned one that breaks it.
  const badReels = data.posts.filter((p) => p.date && p.kind === "reel" && LK.some((k) => p.variants[k].status !== "posted" && reelMediaProblems(p.variants[k]).length)).sort((a, b) => a.date!.localeCompare(b.date!));
  if (!failed.length && !stalled && !brokenAccounts.length && !unnamed.length && !badReels.length) return null;
  const bar = "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 py-2.5 text-[13px] font-medium text-white";
  return (
    <div className="sticky top-0 z-30">
      {failed.length > 0 && (
        <div role="alert" className={bar} style={{ background: "var(--s-failed)" }}>
          <span className="flex-1">
            {failed.length === 1
              ? <>{LANGS.find((l) => l.k === failed[0].k)!.code} of “{failed[0].p.title || "Untitled"}” failed to post: {failed[0].p.variants[failed[0].k].error?.message}</>
              : <>{failed.length} versions failed to post.</>}
          </span>
          <Link href={`/posts/${failed[0].p.id}?lang=${failed[0].k}`} className="underline underline-offset-2 font-bold">Open and retry</Link>
        </div>
      )}
      {stalled && (
        <div role="alert" className={bar} style={{ background: "#b45309" }}>
          <span className="flex-1">
            The scheduler {last ? `last ran ${relTime(last, data.now)}` : "has never run"}. Scheduled posts won’t go out until it’s running.
          </span>
          <Link href="/settings#scheduler" className="underline underline-offset-2 font-bold">Check</Link>
        </div>
      )}
      {unnamed.length > 0 && (
        <div role="status" className={bar} style={{ background: "#475569" }}>
          <span className="flex-1">{unnamed.length === 1 ? "1 planned post has" : `${unnamed.length} planned posts have`} no name yet. Reminders use the name.</span>
          <Link href={`/posts/${unnamed[0].id}`} className="underline underline-offset-2 font-bold">Name it</Link>
        </div>
      )}
      {badReels.length > 0 && (() => {
        const p = badReels[0], k = LK.find((x) => reelMediaProblems(p.variants[x]).length)!;
        return (
          <div role="alert" className={bar} style={{ background: "var(--s-failed)" }}>
            <span className="flex-1">{badReels.length === 1 ? `Reel “${p.title || "Untitled"}” (${LANGS.find((l) => l.k === k)!.code})` : `${badReels.length} planned reels`} {badReels.length === 1 ? "isn’t" : "aren’t"} 1080 × 1920.</span>
            <Link href={`/posts/${p.id}?lang=${k}`} className="underline underline-offset-2 font-bold">Replace the video</Link>
          </div>
        );
      })()}
      {brokenAccounts.length > 0 && (
        <div role="alert" className={bar} style={{ background: "#b45309" }}>
          <span className="flex-1">
            Instagram connection problem for {brokenAccounts.map((k) => LANGS.find((l) => l.k === k)!.handle).join(", ")}: {data.meta.accounts[brokenAccounts[0]]?.lastError}
          </span>
          <Link href="/settings#accounts" className="underline underline-offset-2 font-bold">Fix</Link>
        </div>
      )}
    </div>
  );
}

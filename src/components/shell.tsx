"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Sheet } from "./ui";
import { useAppState } from "@/lib/client/state";
import { api } from "@/lib/client/api";
import { LANGS, LK } from "@/lib/langs";
import { relTime } from "@/lib/time";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Planner", icon: "planner" },
  { href: "/ideas", label: "Ideas", icon: "ideas" },
  { href: "/inspo", label: "Inspo", icon: "inspo" },
  { href: "/posted", label: "Posted", icon: "posted" },
];
const TOOLS: { href: string; label: string; icon: IconName }[] = [
  { href: "/tools/tweet", label: "Tweet card", icon: "tweet" },
  { href: "/tools/editor", label: "Text editor", icon: "editor" },
];

const active = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/login";
  };
  const item = (n: { href: string; label: string; icon: IconName }) => (
    <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-[#c9c9c4] hover:bg-[#232323] hover:text-white aria-[current=page]:bg-white aria-[current=page]:text-[#161616] aria-[current=page]:font-semibold">
      <Icon name={n.icon} size={17} />
      {n.label}
    </Link>
  );
  return (
    <div className="min-h-dvh md:flex">
      <nav aria-label="Sections" className="hidden md:flex w-[208px] flex-none flex-col gap-0.5 px-3 py-4 text-white sticky top-0 h-dvh" style={{ background: "var(--rail)" }}>
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" width={26} height={26} className="rounded-[7px]" />
          <span className="font-bold text-[16px]">Tape</span>
        </Link>
        {NAV.map(item)}
        <div className="px-2.5 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#77776f]">Tools</div>
        {TOOLS.map(item)}
        <div className="flex-1" />
        {item({ href: "/settings", label: "Settings", icon: "settings" })}
        <button onClick={signOut} className="text-left px-2.5 py-2 text-[12px] text-[#8a8a85] hover:text-white">Sign out</button>
      </nav>

      <main className="flex-1 min-w-0 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        <Banners />
        {children}
      </main>

      <nav aria-label="Sections" className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t safe-b" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-semibold text-[var(--muted)] aria-[current=page]:text-[var(--ink)]">
              <Icon name={n.icon} size={21} />
              {n.label}
            </Link>
          ))}
          <button onClick={() => setMore(true)} aria-current={[...TOOLS, { href: "/settings" }].some((t) => active(path, t.href)) ? "page" : undefined}
            className="flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-semibold text-[var(--muted)] aria-[current=page]:text-[var(--ink)]">
            <Icon name="more" size={21} />
            More
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} label="More">
        <div className="p-3 flex flex-col">
          {[...TOOLS, { href: "/settings", label: "Settings", icon: "settings" as IconName }].map((t) => (
            <Link key={t.href} href={t.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-[var(--soft)]">
              <Icon name={t.icon} size={20} /> {t.label}
            </Link>
          ))}
          <button onClick={signOut} className="text-left rounded-lg px-3 py-3 text-[15px] muted">Sign out</button>
        </div>
      </Sheet>
    </div>
  );
}

/** Loud, app-wide warnings: failed posts and a stalled scheduler. */
function Banners() {
  const { data } = useAppState();
  if (!data) return null;
  const failed = data.posts.flatMap((p) => LK.filter((k) => p.variants[k].state === "failed").map((k) => ({ p, k })));
  const scheduled = data.posts.some((p) => LK.some((k) => p.variants[k].state === "scheduled"));
  const last = data.health.lastTickAt;
  const stalled = scheduled && (!last || data.now - last > 5 * 60_000);
  const brokenAccounts = LK.filter((k) => data.meta.accounts[k]?.lastError);
  if (!failed.length && !stalled && !brokenAccounts.length) return null;
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

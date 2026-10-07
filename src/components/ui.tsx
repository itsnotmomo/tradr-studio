"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { STATUS_LABEL, statusOf } from "@/lib/status";
import { useAppState } from "@/lib/client/state";
import { LANGS } from "@/lib/langs";
import type { DisplayStatus, Lang, Post } from "@/lib/types";

export function StatusPill({ s }: { s: DisplayStatus }) {
  return <span className={`pill s-${s}`}>{STATUS_LABEL[s]}</span>;
}

/** Three tiny "EN ● ES ● IT ●" markers. */
export function LangDots({ post, langs = ["it", "es", "en"], labels = true }: { post: Post; langs?: Lang[]; labels?: boolean }) {
  const { data } = useAppState();
  return (
    <span className="inline-flex items-center gap-2">
      {langs.map((k) => {
        const s = statusOf(post, k, data?.settings);
        const code = LANGS.find((l) => l.k === k)!.code;
        return (
          <span key={k} className="lp" title={`${code}: ${STATUS_LABEL[s]}`}>
            {labels && code}
            <i className={`dot s-${s}`} />
          </span>
        );
      })}
    </span>
  );
}

export function Sheet({ open, onClose, children, label, wide }: { open: boolean; onClose: () => void; children: ReactNode; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-label={label} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      style={wide ? { width: "min(980px, calc(100vw - 24px))" } : undefined}>
      {open && children}
    </dialog>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorBox({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border px-3.5 py-3 text-[13px]" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-line)", color: "var(--ink)" }}>
      <div className="font-semibold" style={{ color: "var(--danger)" }}>{title}</div>
      {children && <div className="mt-1 whitespace-pre-line break-words">{children}</div>}
      {action && <div className="mt-2.5 flex gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return <div className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "var(--warn-bg)", color: "var(--warn)" }}>{children}</div>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 px-4 md:px-6 pt-4 md:pt-6 pb-3">
      <div className="flex-1 min-w-[200px]">
        <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
        {sub && <div className="text-[13px] muted mt-0.5">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export const n = (v: number | null | undefined) => (v == null ? "–" : v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : v.toLocaleString("en-US"));

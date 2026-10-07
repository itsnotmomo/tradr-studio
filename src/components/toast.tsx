"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; msg: string; tone: "info" | "error"; action?: { label: string; fn: () => void } };
type Ctx = { toast: (msg: string, opts?: { tone?: "info" | "error"; action?: Toast["action"]; ms?: number }) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx).toast;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const toast = useCallback<Ctx["toast"]>((msg, opts = {}) => {
    const id = ++n.current;
    const tone = opts.tone || "info";
    setItems((xs) => [...xs.slice(-2), { id, msg, tone, action: opts.action }]);
    // Errors stay until dismissed or replaced; info fades.
    if (tone !== "error") setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), opts.ms ?? 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(520px,calc(100vw-24px))] bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-5" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 text-[13px] shadow-[var(--shadow)] ${t.tone === "error" ? "bg-[var(--s-failed)] text-white" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}>
            <span className="flex-1 whitespace-pre-line">{t.msg}</span>
            {t.action && (
              <button className="font-bold underline underline-offset-2" onClick={() => { t.action!.fn(); setItems((xs) => xs.filter((x) => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="opacity-70 hover:opacity-100 font-bold" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

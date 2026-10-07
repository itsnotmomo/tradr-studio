"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Sheet } from "./ui";
import { ApiError } from "@/lib/client/api";

type Ask = (hint?: string) => Promise<string | null>;
const Ctx = createContext<Ask>(async () => null);

/** Asks for a post name. Posts on the planner, or past draft, can't be "Untitled". */
export function NamePromptProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);
  const ask = useCallback<Ask>((h) => {
    setValue("");
    setHint(h || "");
    setOpen(true);
    return new Promise((res) => (resolver.current = res));
  }, []);
  const close = (v: string | null) => {
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Sheet open={open} onClose={() => close(null)} label="Name this post">
        <form className="p-5 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (value.trim()) close(value.trim()); }}>
          <h3 className="font-bold text-[16px]">Name this post</h3>
          <p className="text-[13px] muted -mt-1">{hint || "Reminders use the post name, so it needs one before it goes on the planner."}</p>
          <input className="field text-[16px]" autoFocus placeholder="e.g. Iceberg: what others see" value={value} onChange={(e) => setValue(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => close(null)}>Cancel</button>
            <button className="btn primary" disabled={!value.trim()}>Save name</button>
          </div>
        </form>
      </Sheet>
    </Ctx.Provider>
  );
}

export const useAskName = () => useContext(Ctx);

/**
 * Runs an action; if the server says the post needs a name, asks for one and runs it again
 * with that name. Returns null if you cancel.
 */
export function useNamed() {
  const ask = useAskName();
  return useCallback(async <T,>(run: (title?: string) => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 422) throw e;
      const title = await ask();
      if (!title) return null;
      return run(title);
    }
  }, [ask]);
}

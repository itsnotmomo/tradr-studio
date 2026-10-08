"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type H<T> = { past: T[]; present: T; future: T[] };
export type SetOpts = {
  /** Changes with the same key in quick succession (typing, dragging a colour) become one step. */
  key?: string;
  /** Not an undo step of its own (e.g. switching the language tab). */
  quiet?: boolean;
};

const MERGE_MS = 1000;

/** Undo/redo history for a value. Keeps the last `limit` steps. */
export function useHistory<T>(initial: T | (() => T), limit = 100) {
  const [h, setH] = useState<H<T>>(() => ({ past: [], present: typeof initial === "function" ? (initial as () => T)() : initial, future: [] }));
  const last = useRef<{ key: string; at: number } | null>(null);

  const set = useCallback((fn: (x: T) => T, o: SetOpts = {}) => {
    const now = Date.now();
    const merge = o.quiet || (!!o.key && last.current?.key === o.key && now - last.current.at < MERGE_MS);
    last.current = o.key ? { key: o.key, at: now } : o.quiet ? last.current : null;
    setH((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      return merge ? { ...s, present: next } : { past: [...s.past, s.present].slice(-limit), present: next, future: [] };
    });
  }, [limit]);

  const undo = useCallback(() => {
    last.current = null;
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    last.current = null;
    setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  /** New starting point with no history (e.g. a new image). */
  const reset = useCallback((x: T) => {
    last.current = null;
    setH({ past: [], present: x, future: [] });
  }, []);

  return { state: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

const TEXT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
/** Somewhere the browser's own undo should handle ⌘Z. */
function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el?.tagName) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && TEXT_TYPES.has((el as HTMLInputElement).type);
}

/** ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Shift+Z (and Ctrl+Y) redo, except while typing in a field. */
export function useUndoKeys(undo: () => void, redo: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      const isRedo = (k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey && !e.metaKey);
      if (!isRedo && !(k === "z" && !e.shiftKey)) return;
      e.preventDefault();
      (isRedo ? redo : undo)();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [undo, redo]);
}

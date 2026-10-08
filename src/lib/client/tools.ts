"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useHistory } from "./history";

/** Tool settings, saved to the server so phone and desktop share them. With undo/redo. */
export function useToolState<T extends object>(name: string, defaults: T) {
  const h = useHistory<T>(defaults);
  const [loaded, setLoaded] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { reset } = h;
  useEffect(() => {
    api<Partial<T>>(`/api/tools/${name}`)
      .then((s) => reset({ ...defaults, ...s }))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  // Save a moment after any change, undo and redo included.
  const first = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    if (first.current) {
      first.current = false;
      return;
    }
    clearTimeout(t.current);
    t.current = setTimeout(() => api(`/api/tools/${name}`, { method: "PUT", body: h.state }).catch(() => {}), 800);
  }, [h.state, loaded, name]);
  return { state: h.state, update: h.set, loaded, undo: h.undo, redo: h.redo, canUndo: h.canUndo, canRedo: h.canRedo };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Couldn't load the image"));
    i.src = src;
  });
}

export const canvasBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't export the image"))), type, q));

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export const stamp = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

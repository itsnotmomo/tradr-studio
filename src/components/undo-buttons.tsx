"use client";

import { Icon } from "./icons";

const mac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Undo / redo buttons for the tools (the shortcuts are in useUndoKeys). */
export function UndoButtons({ undo, redo, canUndo, canRedo }: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) {
  const m = mac();
  return (
    <div className="flex gap-1" role="group" aria-label="History">
      <button type="button" className="btn small" onClick={undo} disabled={!canUndo} title={m ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}><Icon name="undo" size={15} /> Undo</button>
      <button type="button" className="btn small" onClick={redo} disabled={!canRedo} title={m ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Shift+Z)"}><Icon name="redo" size={15} /> Redo</button>
    </div>
  );
}

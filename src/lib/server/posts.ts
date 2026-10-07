import "server-only";
import { UserError } from "./store";
import { isLang, LK, langInfo } from "../langs";
import { isLocked } from "../status";
import { isValidHm, isValidYmd, zonedToUtc } from "../time";
import type { Post, Settings, Slide } from "../types";

const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

export function cleanSlides(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) throw new UserError("slides must be a list");
  return raw.map((s) => {
    const x = s as Slide;
    let host = "";
    try {
      host = new URL(x.url).hostname;
    } catch {
      /* invalid */
    }
    if (!x?.id || !BLOB_HOST.test(host) || !(x.w > 0) || !(x.h > 0)) throw new UserError("Invalid slide");
    return { id: String(x.id), url: x.url, w: Math.round(x.w), h: Math.round(x.h) };
  });
}

export type PostPatch = {
  title?: string; notes?: string; date?: string | null; time?: string; inspoId?: string | null;
  variants?: Partial<Record<string, { comment?: string; tradr?: string; hashtags?: string; slides?: unknown; ready?: boolean }>>;
};

/** Applies an edit from the editor or planner, keeping the schedule consistent. Returns notes for the user. */
export function applyPatch(p: Post, patch: PostPatch, s: Settings, now = Date.now()) {
  const notes: string[] = [];
  if (patch.title !== undefined) p.title = String(patch.title).slice(0, 200);
  if (patch.notes !== undefined) p.notes = String(patch.notes).slice(0, 5000);
  if (patch.inspoId !== undefined) p.inspoId = patch.inspoId ? String(patch.inspoId) : null;

  const dateChanged = patch.date !== undefined && patch.date !== p.date;
  const timeChanged = patch.time !== undefined && patch.time !== p.time;
  if (dateChanged || timeChanged) {
    if (patch.date !== undefined && patch.date !== null && !isValidYmd(patch.date)) throw new UserError("Invalid date");
    if (patch.time !== undefined && !isValidHm(patch.time)) throw new UserError("Invalid time");
    const pinned = LK.filter((k) => ["posted", "publishing"].includes(p.variants[k].state));
    if (pinned.length) {
      throw new UserError(`Can't move this post: ${pinned.map((k) => langInfo(k).code).join(", ")} ${pinned.length === 1 ? "is" : "are"} already on Instagram.`);
    }
    const date = patch.date !== undefined ? patch.date : p.date;
    const time = patch.time ?? p.time;
    const scheduled = LK.filter((k) => p.variants[k].state === "scheduled");
    if (scheduled.length) {
      if (!date) {
        for (const k of scheduled) Object.assign(p.variants[k], { state: "idle", scheduledAt: null, nextAttemptAt: null });
        notes.push(`Unscheduled ${scheduled.map((k) => langInfo(k).code).join(", ")}.`);
      } else {
        const at = zonedToUtc(date, time, s.timezone);
        if (at < now + 30_000) throw new UserError("That time has already passed. Pick a later time, or unschedule first.");
        for (const k of scheduled) Object.assign(p.variants[k], { scheduledAt: at, nextAttemptAt: null });
        notes.push(`Rescheduled ${scheduled.map((k) => langInfo(k).code).join(", ")}.`);
      }
    }
    p.date = date;
    p.time = time;
  }

  for (const [k, vp] of Object.entries(patch.variants || {})) {
    if (!isLang(k) || !vp) continue;
    const v = p.variants[k];
    const touchesContent = ["comment", "tradr", "hashtags", "slides"].some((f) => f in vp);
    if (touchesContent && isLocked(v)) throw new UserError(`${langInfo(k).code} is already ${v.state === "posted" ? "posted" : "publishing"} and can't be edited.`);
    if (vp.comment !== undefined) v.comment = String(vp.comment);
    if (vp.tradr !== undefined) v.tradr = String(vp.tradr);
    if (vp.hashtags !== undefined) v.hashtags = String(vp.hashtags);
    if (vp.slides !== undefined) v.slides = cleanSlides(vp.slides);
    if (vp.ready !== undefined) v.ready = !!vp.ready;
  }
  return notes;
}

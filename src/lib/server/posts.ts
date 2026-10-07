import "server-only";
import { UserError } from "./store";
import { isLang, LK, langInfo } from "../langs";
import { isLocked } from "../status";
import { isSlot, publishAt, slotName, slotTaken, zoneLabel } from "../slots";
import { fmtDate, isValidYmd } from "../time";
import type { Lang, Post, PostStatus, Settings, Slide, Slot } from "../types";

const STATUSES: PostStatus[] = ["draft", "ready", "scheduled", "posted"];
export const NAME_REQUIRED = "Give this post a name first. Names are used in reminders.";

/** Anything on the planner, or past draft, needs a real name (notifications use it). */
export function needsName(p: Post) {
  return !p.title.trim() && (!!p.date || LK.some((k) => p.variants[k].status !== "draft"));
}

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
  title?: string; notes?: string; date?: string | null; slot?: Slot; inspoId?: string | null;
  variants?: Partial<Record<string, { comment?: string; tradr?: string; hashtags?: string; slides?: unknown; ready?: boolean; status?: string }>>;
};

const day = (d: string) => fmtDate(d, { weekday: "short", day: "numeric", month: "short" });

/** "Morning on Thu 9 Oct is taken by “Title”." */
export function slotConflictMessage(other: Post, date: string, slot: Slot) {
  return `${slotName(slot)} on ${day(date)} is taken by “${other.title || "Untitled"}”. Each account posts at most once per slot. Pick the other slot or another day.`;
}

/** Recomputes each scheduled version's publish time from the post's day + slot. */
export function resolveSchedule(p: Post, s: Settings, now = Date.now(), langs?: Lang[]) {
  const ks = langs ?? LK.filter((k) => p.variants[k].state === "scheduled");
  if (!p.date) throw new UserError("Give the post a day first.");
  const late = ks.filter((k) => publishAt(s, k, p.date!, p.slot) < now + 30_000);
  if (late.length) {
    const what = late.map((k) => `${langInfo(k).code} ${s.schedule[k][p.slot]} ${zoneLabel(s.schedule[k].zone)}`).join(", ");
    throw new UserError(`${slotName(p.slot)} on ${day(p.date)} has already passed for ${what}. Pick a later slot, or use Post now.`);
  }
  for (const k of ks) Object.assign(p.variants[k], { scheduledAt: publishAt(s, k, p.date, p.slot), nextAttemptAt: null });
}

/** Applies an edit from the editor or planner, keeping the schedule consistent. Returns notes for the user. */
export function applyPatch(p: Post, patch: PostPatch, s: Settings, others: Post[], now = Date.now()) {
  const notes: string[] = [];
  if (patch.title !== undefined) p.title = String(patch.title).slice(0, 200);
  if (patch.notes !== undefined) p.notes = String(patch.notes).slice(0, 5000);
  if (patch.inspoId !== undefined) p.inspoId = patch.inspoId ? String(patch.inspoId) : null;

  const dateChanged = patch.date !== undefined && patch.date !== p.date;
  const slotChanged = patch.slot !== undefined && patch.slot !== p.slot;
  if (dateChanged || slotChanged) {
    if (patch.date !== undefined && patch.date !== null && !isValidYmd(patch.date)) throw new UserError("Invalid date");
    if (patch.slot !== undefined && !isSlot(patch.slot)) throw new UserError("Invalid slot");
    const pinned = LK.filter((k) => ["posted", "publishing"].includes(p.variants[k].state));
    if (pinned.length) {
      throw new UserError(`Can't move this post: ${pinned.map((k) => langInfo(k).code).join(", ")} ${pinned.length === 1 ? "is" : "are"} already on Instagram.`);
    }
    const date = patch.date !== undefined ? patch.date : p.date;
    const slot = patch.slot ?? p.slot;
    if (date) {
      const other = slotTaken(others, date, slot, p.id);
      if (other) throw new UserError(slotConflictMessage(other, date, slot), 409);
    }
    p.date = date;
    p.slot = slot;
    const scheduled = LK.filter((k) => p.variants[k].state === "scheduled");
    if (scheduled.length) {
      if (!date) {
        for (const k of scheduled) Object.assign(p.variants[k], { state: "idle", scheduledAt: null, nextAttemptAt: null });
        notes.push(`Unscheduled ${scheduled.map((k) => langInfo(k).code).join(", ")}.`);
      } else {
        resolveSchedule(p, s, now, scheduled);
        notes.push(`Rescheduled ${scheduled.map((k) => langInfo(k).code).join(", ")}.`);
      }
    }
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
    if (vp.status !== undefined) {
      if (!STATUSES.includes(vp.status as PostStatus)) throw new UserError("Invalid status");
      v.status = vp.status as PostStatus;
      v.ready = v.status !== "draft";
    }
  }
  if (needsName(p)) throw new UserError(NAME_REQUIRED, 422);
  return notes;
}

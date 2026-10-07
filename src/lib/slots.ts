import { zonedToUtc } from "./time";
import type { Lang, Post, Settings, Slot } from "./types";

export const SLOTS: { k: Slot; name: string }[] = [
  { k: "morning", name: "Morning" },
  { k: "afternoon", name: "Afternoon" },
];
export const slotName = (s: Slot) => (s === "morning" ? "Morning" : "Afternoon");
export const isSlot = (v: unknown): v is Slot => v === "morning" || v === "afternoon";

export const DEFAULT_SCHEDULE: Settings["schedule"] = {
  it: { zone: "Europe/Rome", morning: "10:00", afternoon: "14:00" },
  es: { zone: "America/Argentina/Buenos_Aires", morning: "10:00", afternoon: "14:00" },
  en: { zone: "UTC", morning: "12:00", afternoon: "18:00" },
};

/** When this account publishes a post in this slot on this day (ms, UTC). DST-correct per zone. */
export const publishAt = (s: Settings, k: Lang, date: string, slot: Slot) =>
  zonedToUtc(date, s.schedule[k][slot], s.schedule[k].zone);

/** Short zone label, e.g. "Rome", "Buenos Aires", "UTC". */
export const zoneLabel = (z: string) => (z === "UTC" ? "UTC" : (z.split("/").pop() || z).replace(/_/g, " "));

/** Old posts had an HH:MM time; map it to the nearest slot. */
export const slotFromTime = (t: string | undefined): Slot => {
  if (!t) return "morning";
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m < 12 * 60 ? "morning" : "afternoon";
};

/** Another post already in this day + slot (every post goes to all three accounts). */
export function slotTaken(posts: Post[], date: string, slot: Slot, exceptId?: string) {
  return posts.find((p) => p.id !== exceptId && p.date === date && p.slot === slot) || null;
}

/** First free slot on a day, or null if both are taken. */
export function freeSlot(posts: Post[], date: string, exceptId?: string, prefer?: Slot): Slot | null {
  const order: Slot[] = prefer === "afternoon" ? ["afternoon", "morning"] : ["morning", "afternoon"];
  return order.find((s) => !slotTaken(posts, date, s, exceptId)) || null;
}


const ORDER: Lang[] = ["it", "es", "en"];

/** "IT 10:00 · ES 10:00 · EN 12:00" (each in its own zone). */
export function slotTimes(s: Settings, slot: Slot, only?: Lang[]) {
  return ORDER.filter((k) => !only || only.includes(k)).map((k) => `${k.toUpperCase()} ${s.schedule[k][slot]}`).join(" · ");
}

// Builds the plan for scheduling a date range in Instagram's web scheduler (see SCHEDULING.md):
// every Ready version per account in posting order, its Rome time (cross-checked two ways),
// collaborator, and its files + caption downloaded to .schedule/<from>_<to>/.
//
// Usage:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/schedule-plan.ts --from 2026-10-09 --to 2026-10-11
//   npx tsx --env-file=.env.local --conditions=react-server scripts/schedule-plan.ts --next-week
// Flags: --no-download (plan only), --tz <zone> = the time zone Instagram's scheduler uses, i.e. the
// browser's zone (check it first: Intl.DateTimeFormat().resolvedOptions().timeZone in the Instagram tab).
// Default Asia/Makassar (the Mac was on Bali time on 2026-10-09). Rome times are always printed too.
//
// Exit code 2 = the time cross-check disagreed somewhere. Don't schedule anything until that's resolved.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listPosts } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import { buildCaption, charCount, hashtagCount } from "@/lib/caption";
import { collabOf } from "@/lib/collab";
import { langInfo } from "@/lib/langs";
import { CAPTION_MAX, HASHTAG_MAX } from "@/lib/rules";
import { publishAt, SLOT_ORDER, slotName } from "@/lib/slots";
import { addDays, parseYmd, utcToZoned, weekStart, ymd } from "@/lib/time";
import type { Lang, Post, Settings } from "@/lib/types";

/** Scheduling order: English, then Italian, then Spanish. */
const RUN_ORDER: Lang[] = ["en", "it", "es"];
const MIN_LEAD_MS = 30 * 60_000;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

/**
 * Independent check of the slot resolver: walks UTC minutes across the day and finds the
 * instant whose wall clock in `zone` is `date time`, using only Intl. No shared code with zonedToUtc.
 */
function bruteForceInstant(date: string, time: string, zone: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d) - 15 * 3600_000;
  for (let t = start; t < start + 54 * 3600_000; t += 15 * 60_000) {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time) return t;
  }
  return null;
}

/** The owner's sanity table for October 2026 (Rome time, Morning / Reel / Afternoon). */
function ownerTable(date: string, k: Lang, slot: Post["slot"]) {
  if (date < "2026-10-01" || date > "2026-11-30") return null;
  const before = date < "2026-10-25";
  const t: Record<Lang, [string, string, string]> = before
    ? { en: ["06:00", "09:00", "12:00"], it: ["10:00", "12:00", "14:00"], es: ["15:00", "17:00", "19:00"] }
    : { en: ["05:00", "08:00", "11:00"], it: ["10:00", "12:00", "14:00"], es: ["14:00", "16:00", "18:00"] };
  return t[k][{ morning: 0, reel: 1, afternoon: 2 }[slot]];
}

type Item = {
  lang: Lang; handle: string; postId: string; title: string; kind: Post["kind"]; date: string; slot: Post["slot"];
  local: string; zone: string; at: number; schedulerDate: string; schedulerTime: string; romeDate: string; romeTime: string;
  collab: string | null; caption: string; files: string[]; dir: string;
};
type Skip = { lang: Lang; title: string; date: string; slot: string; reason: string };

function problems(p: Post, k: Lang, s: Settings, now: number, at: number) {
  const v = p.variants[k];
  const out: string[] = [];
  if (v.status === "scheduled" || v.status === "posted") out.push(`already marked ${v.status}`);
  else if (v.status !== "ready") out.push(`status is ${v.status}, not ready`);
  if (!p.title.trim()) out.push("no name");
  if (p.kind === "reel") {
    if (!v.video) out.push(v.videoRemovedAt ? "video was removed" : "no video");
  } else {
    if (!v.slides.length) out.push("no slides");
    if (!s.langs[k].tradrSlide) out.push("Tradr slide not set in Settings");
    if (v.slides.length + (s.langs[k].tradrSlide ? 1 : 0) > 20) out.push("more than 20 slides");
  }
  const cap = buildCaption(v);
  if (!v.comment.trim()) out.push("no caption");
  if (charCount(cap) > CAPTION_MAX) out.push(`caption over ${CAPTION_MAX} characters`);
  if (hashtagCount(cap) > HASHTAG_MAX) out.push(`over ${HASHTAG_MAX} hashtags`);
  if (at - now < MIN_LEAD_MS) out.push(at <= now ? "slot time has passed" : "less than 30 minutes away");
  return out;
}

async function download(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

const ext = (url: string, fallback: string) => (new URL(url).pathname.match(/\.(\w{2,5})$/)?.[1] || fallback).toLowerCase();

async function main() {
  let from = arg("from"), to = arg("to");
  if (flag("next-week")) {
    const mon = addDays(weekStart(new Date()), 7);
    from = ymd(mon);
    to = ymd(addDays(mon, 6));
  }
  if (!from || !to) throw new Error("Pass --from YYYY-MM-DD --to YYYY-MM-DD, or --next-week");
  const tz = arg("tz") || "Asia/Makassar";
  const now = Date.now();
  const [s, posts] = await Promise.all([getSettings(), listPosts()]);
  const inRange = posts
    .filter((p) => p.date && p.date >= from! && p.date <= to!)
    .sort((a, b) => a.date!.localeCompare(b.date!) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.createdAt - b.createdAt);

  const root = join(process.cwd(), ".schedule", `${from}_${to}`);
  const items: Item[] = [], skips: Skip[] = [], mismatches: string[] = [];

  for (const k of RUN_ORDER) {
    for (const p of inRange) {
      const sc = s.schedule[k];
      const local = sc[p.slot];
      const at = publishAt(s, k, p.date!, p.slot);
      const there = utcToZoned(at, tz);
      // Cross-check 1: an independent conversion. Cross-check 2: the owner's table.
      const brute = bruteForceInstant(p.date!, local, sc.zone);
      const label = `${langInfo(k).code} ${p.date} ${slotName(p.slot)}`;
      if (brute !== at) mismatches.push(`${label}: resolver ${new Date(at).toISOString()} vs independent ${brute ? new Date(brute).toISOString() : "none"}`);
      const rome = utcToZoned(at, "Europe/Rome");
      const table = ownerTable(p.date!, k, p.slot);
      if (table && (table !== rome.time || rome.date !== p.date)) mismatches.push(`${label}: resolver says ${rome.date} ${rome.time} Rome, table says ${table}`);

      const why = problems(p, k, s, now, at);
      if (why.length) {
        skips.push({ lang: k, title: p.title || "Untitled", date: p.date!, slot: slotName(p.slot), reason: why.join("; ") });
        continue;
      }
      const v = p.variants[k];
      const dir = join(root, k, `${p.date}_${SLOT_ORDER[p.slot] + 1}-${p.slot}`);
      items.push({
        lang: k, handle: langInfo(k).handle, postId: p.id, title: p.title, kind: p.kind, date: p.date!, slot: p.slot,
        local: `${local} ${sc.zone}`, zone: sc.zone, at, schedulerDate: there.date, schedulerTime: there.time, romeDate: rome.date, romeTime: rome.time,
        collab: collabOf(p, k), caption: buildCaption(v), files: [], dir,
      });
    }
  }

  if (!flag("no-download")) {
    for (const it of items) {
      const p = inRange.find((x) => x.id === it.postId)!;
      const v = p.variants[it.lang];
      await mkdir(it.dir, { recursive: true });
      const urls: [string, string][] = p.kind === "reel"
        ? [[v.video!.url, `video.${ext(v.video!.url, "mp4")}`], ...(v.cover ? [[v.cover.url, `cover.${ext(v.cover.url, "jpg")}`] as [string, string]] : [])]
        : [...v.slides, s.langs[it.lang].tradrSlide!].map((x, i) => [x.url, `${String(i + 1).padStart(2, "0")}${i === v.slides.length ? "-tradr" : ""}.${ext(x.url, "jpg")}`]);
      for (const [url, name] of urls) {
        await download(url, join(it.dir, name));
        it.files.push(join(it.dir, name));
      }
      await writeFile(join(it.dir, "caption.txt"), it.caption);
    }
  }

  await mkdir(root, { recursive: true });
  await writeFile(join(root, "plan.json"), JSON.stringify({ from, to, schedulerZone: tz, generatedAt: new Date(now).toISOString(), mismatches, items, skips }, null, 2));

  const lines: string[] = [`Plan ${from} → ${to} (scheduler zone ${tz})`, ""];
  for (const k of RUN_ORDER) {
    lines.push(`${langInfo(k).code} ${langInfo(k).handle}`);
    for (const it of items.filter((x) => x.lang === k)) {
      lines.push(`  TYPE ${it.schedulerDate} ${it.schedulerTime}  (Rome ${it.romeDate.slice(5)} ${it.romeTime})  ${slotName(it.slot).padEnd(9)} ${it.kind === "reel" ? "REEL" : `${it.files.length || "?"} slides`.padEnd(8)}  ${it.title}${it.collab ? `  [collab ${it.collab}]` : ""}   (${it.local})`);
    }
    lines.push("");
  }
  if (skips.length) {
    lines.push("Skipped:");
    for (const x of skips) lines.push(`  ${langInfo(x.lang).code} ${x.date} ${x.slot} “${x.title}”: ${x.reason}`);
    lines.push("");
  }
  if (mismatches.length) {
    lines.push("TIME CHECK FAILED — don't schedule anything:");
    for (const m of mismatches) lines.push(`  ${m}`);
  } else lines.push("Time check: resolver, independent conversion and owner table all agree.");
  lines.push("", `Files: ${root}`);
  console.log(lines.join("\n"));
  if (mismatches.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

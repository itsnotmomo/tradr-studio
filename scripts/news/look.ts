// Read-only view of Tradr Media (tradr-studio.vercel.app) from the Mac, for Sara and Saretta (23 Nov 2026).
// It shows what the Instagram and X boards show, grouped the same way. It never writes anything.
//
// Run from ~/Desktop/tradrig:
//   L="npx tsx --conditions=react-server scripts/news/look.ts"
//   $L                          every board: To review / Scheduled / Posted / Rejected, Pitches, Queued and recent
//   $L --json                   the same, as JSON (for scripts)
//   $L <id>                     one post (or pitch) in full: slides, caption, X text, sources, notes, history
//   $L <id> --json              the same, as JSON
//   $L <id> --download <dir>    save that post's slides (and the shared end slide) to <dir>
//   $L style                    the Style screen: end slide, references, taste file, style guide
//   $L --all                    the list without shortening long captions
//
// Read-only by construction:
//   - only the store's read functions are imported (listNews, listSuggestions, getNewsDesk);
//   - the Redis client is given the READ-ONLY token (KV_REST_API_READ_ONLY_TOKEN), so even a write by mistake is refused;
//   - the Blob write token is removed from this process.
// Prints no secrets. An id can be shortened to its first 8 characters.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ENV_FILE = path.resolve(".env.local");
const BOARD_PATH = { ig: "/instagram", x: "/x" } as const;
const SITE = "https://tradr-studio.vercel.app";
/** Same windows as the board (src/components/media/board.tsx). */
const PITCH_FRESH = 3 * 864e5;
const RECENT = 3 * 864e5;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

// ---------- Environment: read-only credentials only ----------

if (!existsSync(ENV_FILE)) {
  fail(`Can't find .env.local in ${process.cwd()}.\nRun this from ~/Desktop/tradrig (the Tradr Media folder), where .env.local holds the studio's keys.`);
}
process.loadEnvFile(ENV_FILE);
const ro = process.env.KV_REST_API_READ_ONLY_TOKEN;
if (!process.env.KV_REST_API_URL || !ro) fail(".env.local has no KV_REST_API_URL / KV_REST_API_READ_ONLY_TOKEN, so the studio can't be read. Ask Lorenzo.");
process.env.KV_REST_API_TOKEN = ro; // the store's client now holds a token that can only read
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.KV_URL;
delete process.env.REDIS_URL;

// ---------- Args ----------

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const json = flag("--json");
const all = flag("--all");
const dlAt = argv.indexOf("--download");
const dlDir = dlAt >= 0 ? argv[dlAt + 1] : null;
if (dlAt >= 0 && !dlDir) fail("--download needs a folder, e.g. --download /tmp/look");
const pos = argv.filter((a, i) => !a.startsWith("-") && !(dlAt >= 0 && i === dlAt + 1));
const target = pos[0] ?? null;
if (flag("--help") || flag("-h") || target === "help") {
  console.log(`Tradr Media, read-only.
  look                        every board (To review / Scheduled / Posted / Rejected, Pitches, Queued and recent)
  look <id>                   one post or pitch in full
  look <id> --download <dir>  save its slides to <dir>
  look style                  end slide, references, taste file, style guide
  --json                      JSON instead of text      --all   don't shorten long text`);
  process.exit(0);
}

// ---------- Formatting ----------

const ROME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const when = (ms: number | null | undefined) => (ms ? `${ROME.format(ms)} Rome` : "—");
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const clip = (s: string, n: number) => (all || s.length <= n ? s : s.slice(0, n).trimEnd() + " …");
const indent = (s: string, pad = "      ") => s.split("\n").map((l) => pad + l).join("\n");

async function main() {
  // Same reads as GET /api/news (src/app/api/news/route.ts), which feeds both boards and the Style screen.
  const { listNews, listSuggestions, getNewsDesk } = await import("@/lib/server/store");
  const { platformState, tabOf, endSlideOf, PLATFORM_STATE_LABEL } = await import("@/lib/news");
  const { relTime } = await import("@/lib/time");
  type NewsDraft = import("@/lib/news").NewsDraft;
  type NewsSuggestion = import("@/lib/news").NewsSuggestion;
  type Platform = import("@/lib/news").Platform;
  type PlatformState = import("@/lib/news").PlatformState;

  let drafts: NewsDraft[], suggestions: NewsSuggestion[], desk: Awaited<ReturnType<typeof getNewsDesk>>;
  try {
    [drafts, suggestions, desk] = await Promise.all([listNews(), listSuggestions(), getNewsDesk()]);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(m + String((e as { cause?: unknown })?.cause ?? ""))) {
      fail("Can't reach the studio's database (no internet connection?). Try again when the Mac is online.");
    }
    if (/unauthori[sz]ed|WRONGPASS|NOPERM|401|403/i.test(m)) fail("The studio's database refused the read key in .env.local. Ask Lorenzo.");
    fail(`Couldn't read the studio: ${m}`);
  }
  const now = Date.now();
  drafts.sort((a, b) => b.createdAt - a.createdAt);
  suggestions.sort((a, b) => b.createdAt - a.createdAt);
  const end = endSlideOf(desk);

  const hookOf = (d: NewsDraft) => {
    const s = (d as unknown as { spec?: { slides?: { headline?: string; type?: string }[] } }).spec?.slides?.[0];
    return s?.headline ? s.headline.replace(/\s*\n\s*/g, " ") : null;
  };

  // ---------- The two boards, exactly as board.tsx sorts and filters them ----------
  const REVIEW_ORDER: Record<PlatformState, number> = { failed: 0, ready: 1, review: 2, changes: 3, posting: 4, scheduled: 5, posted: 6, rejected: 7 };
  const igAt = (d: NewsDraft) => d.post?.igAt ?? 0;
  const board = (platform: Platform) => {
    const rows = drafts.map((d) => ({ d, s: platformState(d, platform, now) }));
    const tab = (t: "review" | "scheduled" | "posted") => {
      const list = rows.filter((r) => r.s !== "rejected" && tabOf(r.s) === t);
      if (t === "review") return list.sort((a, b) => REVIEW_ORDER[a.s] - REVIEW_ORDER[b.s] || b.d.createdAt - a.d.createdAt);
      if (t === "scheduled") return list.sort((a, b) => igAt(a.d) - igAt(b.d));
      return list.sort((a, b) => (platform === "ig" ? igAt(b.d) - igAt(a.d) : 0) || (b.d.postedAt ?? b.d.updatedAt) - (a.d.postedAt ?? a.d.updatedAt));
    };
    return {
      review: tab("review"), scheduled: tab("scheduled"), posted: tab("posted"),
      rejected: rows.filter((r) => r.s === "rejected").sort((a, b) => b.d.updatedAt - a.d.updatedAt),
    };
  };
  const pitches = suggestions.filter((s) => s.status === "pitch" && now - s.createdAt < PITCH_FRESH);
  const queued = suggestions.filter((s) => s.status === "queued").sort((a, b) => a.createdAt - b.createdAt);
  const recent = suggestions.filter((s) => (s.status === "done" || s.status === "skipped") && s.pitch !== "dismissed" && now - s.updatedAt < RECENT);
  const sugLine = (s: NewsSuggestion) =>
    s.status === "queued" ? (s.pitch === "chosen" ? "Pitch · queued for the next run" : "Queued for the next run") : s.status === "skipped" ? `Skipped: ${s.note}` : s.status === "pitch" ? (s.pitch === "dismissed" ? "Pitch · dismissed" : "Pitch · waiting for Make this one") : "Drafted";

  const draftJson = (d: NewsDraft, full = false) => ({
    id: d.id, title: d.title, hook: hookOf(d), tag: d.tag,
    instagram: PLATFORM_STATE_LABEL[platformState(d, "ig", now)], x: PLATFORM_STATE_LABEL[platformState(d, "x", now)],
    status: d.status, version: d.version, scout: !!d.scout, collab: d.collab ?? null,
    createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt), approvedAt: iso(d.approvedAt), postedAt: iso(d.postedAt),
    bestTime: d.bestTime ? { at: iso(d.bestTime.at), why: d.bestTime.why } : null,
    post: d.post ? { state: d.post.state, instagramGoesLiveAt: iso(d.post.igAt), instagramScheduled: !!d.post.igScheduledAt, tweetUrl: d.post.tweetUrl, error: d.post.error } : null,
    changeNote: d.changeNote || null,
    caption: d.caption, xText: d.x,
    slides: d.slides.map((s) => ({ kind: s.kind, url: s.url, ...(s.poster ? { poster: s.poster } : {}), ...(s.duration ? { duration: s.duration } : {}) })),
    endSlide: end?.url ?? null,
    studio: `${SITE}${BOARD_PATH.ig}?id=${d.id}`,
    ...(full ? {
      sources: d.sources, photos: d.photos, confirmed: d.confirmed, reported: d.reported,
      history: d.history.map((h) => ({ at: iso(h.at), what: h.what })),
      edits: (d.edits ?? []).map((e) => ({ at: iso(e.at), field: e.field, slide: e.slide ?? null, before: e.before, after: e.after })),
      suggestionId: d.suggestionId,
    } : {}),
  });
  const sugJson = (s: NewsSuggestion) => ({ id: s.id, text: s.text, url: s.url, why: s.note || null, status: s.status, pitch: s.pitch ?? null, draftId: s.draftId, createdAt: iso(s.createdAt), updatedAt: iso(s.updatedAt), shown: sugLine(s) });

  const statusLine = (d: NewsDraft) => {
    const ig = platformState(d, "ig", now), x = platformState(d, "x", now);
    const bits = [`Instagram: ${PLATFORM_STATE_LABEL[ig]}`, `X: ${PLATFORM_STATE_LABEL[x]}`];
    return bits.join(" · ");
  };
  const datesLine = (d: NewsDraft) => {
    const out = [`created ${when(d.createdAt)} (${relTime(d.createdAt, now)})`];
    if (d.post?.igAt) out.push(`Instagram ${d.post.igScheduledAt ? (d.post.igAt > now ? "goes live" : "went live") : "to be scheduled for"} ${when(d.post.igAt)}`);
    else if (d.bestTime) out.push(`best time ${when(d.bestTime.at)}`);
    if (d.postedAt) out.push(`${d.post ? "poster done" : "marked posted"} ${when(d.postedAt)}`);
    return out.join(" · ");
  };
  const printDraft = (d: NewsDraft, full: boolean) => {
    const hook = hookOf(d);
    console.log(`  • ${d.title}${d.tag ? `  [${d.tag}]` : ""}${d.scout ? "  (scout)" : ""}${d.collab ? `  (collab @${d.collab.handle})` : ""}`);
    console.log(`    id ${d.id} · version ${d.version}`);
    if (hook) console.log(`    hook: ${hook}`);
    console.log(`    ${statusLine(d)}`);
    console.log(`    ${datesLine(d)}`);
    if (d.bestTime?.why && !d.post) console.log(`    best time why: ${d.bestTime.why}`);
    if (d.status === "changes" && d.changeNote) console.log(`    changes asked: “${d.changeNote}”`);
    if (d.post?.state === "failed" && d.post.error) console.log(`    posting stopped: ${d.post.error}`);
    if (d.post?.tweetUrl) console.log(`    tweet: ${d.post.tweetUrl}`);
    console.log(`    caption:\n${indent(full ? d.caption : clip(d.caption, 400))}`);
    console.log(`    X text (${d.x.length}/280):\n${indent(d.x)}`);
    console.log(`    slides (${d.slides.length}${end ? " + shared end slide" : ""}):`);
    d.slides.forEach((s, i) => console.log(`      ${i + 1}. ${s.kind === "video" ? `video${s.duration ? ` ${Math.round(s.duration)}s` : ""}` : "image"}  ${s.url}${s.poster ? `\n         poster ${s.poster}` : ""}`));
    if (end) console.log(`      end. image  ${end.url}`);
  };

  // ---------- look style ----------
  if (target === "style") {
    const refsPending = desk.refs.filter((r) => !desk.guideRefIds.includes(r.id)).length;
    if (json) {
      console.log(JSON.stringify({
        lastRunAt: iso(desk.lastRunAt), lastRunSummary: desk.lastRunSummary,
        endSlide: end, endChosen: !!desk.endChoice, endOptions: desk.endOptions,
        refs: desk.refs.map((r) => ({ id: r.id, url: r.url, note: r.note, addedAt: iso(r.addedAt), inGuide: desk.guideRefIds.includes(r.id) })),
        taste: desk.taste ?? "", tasteUpdatedAt: iso(desk.tasteUpdatedAt), guide: desk.guide, guideUpdatedAt: iso(desk.guideUpdatedAt),
      }, null, 2));
      return;
    }
    console.log(`STYLE  (${SITE}/style)\n`);
    console.log(`Scout last ran: ${desk.lastRunAt ? `${when(desk.lastRunAt)} (${relTime(desk.lastRunAt, now)})` : "never"}${desk.lastRunSummary ? `\n  ${desk.lastRunSummary}` : ""}\n`);
    console.log(`End slide (${desk.endChoice ? "chosen" : "not chosen, the first is used"}):`);
    desk.endOptions.forEach((o, i) => console.log(`  ${o.id === end?.id ? "✓" : " "} ${i + 1}. ${o.line.replace(/\s*\n\s*/g, " ")} / ${o.sub}\n      ${o.url}`));
    console.log(`\nStyle references: ${desk.refs.length} (${refsPending} new, not yet in the guide)`);
    desk.refs.forEach((r) => console.log(`  • ${r.note || "(no note)"}${desk.guideRefIds.includes(r.id) ? "" : "  [new]"}\n      ${r.url}`));
    console.log(`\nTaste file${desk.tasteUpdatedAt ? ` (updated ${when(desk.tasteUpdatedAt)})` : ""}:\n${indent(desk.taste || "Nothing learned yet.", "  ")}`);
    console.log(`\nStyle guide${desk.guideUpdatedAt ? ` (updated ${when(desk.guideUpdatedAt)})` : ""}:\n${indent(desk.guide || "Not written yet.", "  ")}`);
    return;
  }

  // ---------- look <id> ----------
  if (target) {
    const match = <T extends { id: string }>(xs: T[]) => xs.filter((x) => x.id === target || (target.length >= 6 && x.id.startsWith(target)));
    const ds = match(drafts), ss = match(suggestions);
    if (ds.length + ss.length === 0) fail(`Nothing in the studio with id ${target}. Run look (no id) to see every id.`);
    if (ds.length + ss.length > 1) fail(`${target} matches more than one item; use more of the id.`);
    if (ss.length) {
      const s = ss[0];
      if (dlDir) fail("That id is a pitch or suggestion: it has no slides to download.");
      if (json) { console.log(JSON.stringify(sugJson(s), null, 2)); return; }
      console.log(`${s.status === "pitch" ? "PITCH" : "SUGGESTION"}  ${s.text}`);
      console.log(`id ${s.id} · status ${s.status}${s.pitch ? ` (pitch ${s.pitch})` : ""} · ${sugLine(s)}`);
      console.log(`created ${when(s.createdAt)} · updated ${when(s.updatedAt)}`);
      if (s.note) console.log(`note / why: ${s.note}`);
      if (s.url) console.log(`source: ${s.url}`);
      if (s.draftId) console.log(`became draft: ${s.draftId}`);
      return;
    }
    const d = ds[0];
    if (dlDir) {
      await mkdir(dlDir, { recursive: true });
      const files: { kind: string; url: string; file: string }[] = [];
      const items: { name: string; url: string; kind: string }[] = [];
      d.slides.forEach((s, i) => {
        const n = String(i + 1).padStart(2, "0");
        items.push({ name: `${n}.${s.kind === "video" ? "mp4" : "jpg"}`, url: s.url, kind: s.kind });
        if (s.poster) items.push({ name: `${n}.poster.jpg`, url: s.poster, kind: "poster" });
      });
      if (end) items.push({ name: `${String(d.slides.length + 1).padStart(2, "0")}.end.jpg`, url: end.url, kind: "end" });
      for (const it of items) {
        let res: Response;
        try { res = await fetch(it.url); } catch { fail(`Couldn't download ${it.url} (no internet connection?).`); }
        if (!res.ok) fail(`Couldn't download ${it.url} (HTTP ${res.status}).`);
        const file = path.resolve(dlDir, it.name);
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        files.push({ kind: it.kind, url: it.url, file });
      }
      if (json) console.log(JSON.stringify({ id: d.id, title: d.title, files }, null, 2));
      else {
        console.log(`Saved ${files.length} file${files.length === 1 ? "" : "s"} for “${d.title}” (v${d.version}):`);
        files.forEach((f) => console.log(`  ${f.file}  (${f.kind})`));
      }
      return;
    }
    if (json) { console.log(JSON.stringify(draftJson(d, true), null, 2)); return; }
    console.log(`POST  ${d.title}\n`);
    printDraft(d, true);
    console.log(`    studio: ${SITE}${BOARD_PATH.ig}?id=${d.id}`);
    if (d.approvedAt) console.log(`    approved ${when(d.approvedAt)}`);
    console.log(`    last changed ${when(d.updatedAt)}`);
    if (d.changeNote) console.log(`    latest change note: “${d.changeNote}”`);
    if (d.confirmed.length) console.log(`    confirmed:\n${d.confirmed.map((c) => `      - ${c}`).join("\n")}`);
    if (d.reported.length) console.log(`    reported, not confirmed:\n${d.reported.map((c) => `      - ${c}`).join("\n")}`);
    if (d.sources.length) console.log(`    sources:\n${d.sources.map((s) => `      - ${s.label}: ${s.url}`).join("\n")}`);
    if (d.photos.length) console.log(`    photos:\n${d.photos.map((p) => `      - ${p.what}: ${p.credit}${p.license ? ` (${p.license})` : ""} ${p.page || p.url}`).join("\n")}`);
    console.log(`    history (review notes and redos):\n${d.history.map((h) => `      ${when(h.at)}  ${h.what}`).join("\n") || "      none"}`);
    if (d.edits?.length) {
      console.log(`    hand edits:`);
      d.edits.forEach((e) => console.log(`      ${when(e.at)}  ${e.field}${e.slide != null ? ` slide ${e.slide}` : ""}\n        before: ${clip(e.before, 300)}\n        after:  ${clip(e.after, 300)}`));
    }
    return;
  }

  // ---------- look (everything) ----------
  const ig = board("ig"), x = board("x");
  if (json) {
    const ids = (rows: { d: NewsDraft }[]) => rows.map((r) => r.d.id);
    console.log(JSON.stringify({
      readAt: iso(now),
      scout: { lastRunAt: iso(desk.lastRunAt), lastRunSummary: desk.lastRunSummary },
      counts: {
        instagram: { toReview: ig.review.length, scheduled: ig.scheduled.length, posted: ig.posted.length, rejected: ig.rejected.length },
        x: { toReview: x.review.length, scheduled: x.scheduled.length, posted: x.posted.length, rejected: x.rejected.length },
        pitches: pitches.length, queued: queued.length, recentSuggestions: recent.length, draftsTotal: drafts.length,
      },
      instagram: { toReview: ids(ig.review), scheduled: ids(ig.scheduled), posted: ids(ig.posted), rejected: ids(ig.rejected) },
      x: { toReview: ids(x.review), scheduled: ids(x.scheduled), posted: ids(x.posted), rejected: ids(x.rejected) },
      drafts: drafts.map((d) => draftJson(d)),
      pitches: pitches.sort((a, b) => b.createdAt - a.createdAt).map(sugJson),
      queuedAndRecent: [...queued, ...recent].map(sugJson),
    }, null, 2));
    return;
  }

  console.log(`TRADR MEDIA (read-only) · read ${when(now)}`);
  if (desk.lastRunAt) console.log(`Scout ran ${relTime(desk.lastRunAt, now)}${desk.lastRunSummary ? `: ${desk.lastRunSummary}` : ""}`);
  console.log(`\nInstagram board: To review ${ig.review.length} · Scheduled ${ig.scheduled.length} · Posted ${ig.posted.length} · Rejected ${ig.rejected.length}`);
  console.log(`X board:         To review ${x.review.length} · Scheduled ${x.scheduled.length} · Posted ${x.posted.length} · Rejected ${x.rejected.length}`);
  console.log(`Pitches ${pitches.length} · Queued ${queued.length} · Recent suggestions ${recent.length}`);
  console.log(`(Every post goes to both boards; the groups below follow the Instagram board, with each post's X state on its line.)`);

  const section = (name: string, rows: { d: NewsDraft }[], empty: string) => {
    console.log(`\n=== ${name} (${rows.length}) ===`);
    if (!rows.length) console.log(`  ${empty}`);
    rows.forEach((r) => { printDraft(r.d, false); console.log(""); });
  };
  section("TO REVIEW", ig.review, "Nothing to review.");
  section("SCHEDULED", ig.scheduled, "Nothing scheduled on Instagram.");
  section("POSTED", ig.posted, "Nothing posted yet.");
  section("REJECTED", ig.rejected, "None.");

  const xOnly = (["review", "scheduled", "posted"] as const).flatMap((t) =>
    x[t].filter((r) => !ig[t].some((y) => y.d.id === r.d.id)).map((r) => `  ${r.d.title} (${r.d.id.slice(0, 8)}): X ${PLATFORM_STATE_LABEL[r.s]}`));
  if (xOnly.length) console.log(`\n=== WHERE THE X BOARD DIFFERS ===\n${xOnly.join("\n")}`);

  console.log(`\n=== PITCHES (${pitches.length}) ===`);
  if (!pitches.length) console.log("  No pitches right now.");
  pitches.sort((a, b) => b.createdAt - a.createdAt).forEach((s) => {
    console.log(`  • ${s.text}\n    id ${s.id} · ${relTime(s.createdAt, now)}${s.note ? `\n    why: ${s.note}` : ""}${s.url ? `\n    source: ${s.url}` : ""}`);
  });
  if (queued.length || recent.length) {
    console.log(`\n=== QUEUED AND RECENT (${queued.length + recent.length}) ===`);
    [...queued, ...recent].forEach((s) => console.log(`  • ${s.text}\n    id ${s.id} · ${sugLine(s)}`));
  }
  console.log(`\nOne post in full: look <id> · its slides: look <id> --download <folder> · the Style screen: look style`);
}

main().then(() => process.exit(0), (e) => fail(e instanceof Error ? e.message : String(e)));

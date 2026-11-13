// The News desk CLI used by the "make news posts" run (see docs/NEWS.md).
// npx tsx --env-file=.env.local --conditions=react-server scripts/news/desk.ts <command>
//
//   inbox                          what to do: queued suggestions, change requests, style guide, recent stories
//   publish <spec.json>            render + upload + create the draft (or redo it when spec.draftId is set)
//   skip <suggestionId> <reason>   close a suggestion that can't become a post, with the reason shown in Studio
//   refs <dir>                     download the style references to <dir> (to read them when updating the guide)
//   guide <guide.md>               save the style guide (marks every current reference as covered)
//   ends <ends.json>               render + upload the last-slide wording options [{line, sub}]
//   summary "<text>"               store the run summary shown at the top of News
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import {
  createNews, getNews, getNewsDesk, listNews, listSuggestions, mutateNews, mutateNewsDesk, mutateSuggestion, uid,
} from "@/lib/server/store";
import type { EndOption, NewsSlide } from "@/lib/news";
import { renderEnds, renderSpec, type Spec } from "./render";

const [cmd, ...args] = process.argv.slice(2);

async function upload(file: string, key: string, type: string) {
  const r = await put(key, await readFile(file), { access: "public", contentType: type, addRandomSuffix: true });
  return r.url;
}

function check(spec: Spec) {
  const errs: string[] = [];
  if (!spec.slides?.length || spec.slides.length < 2 || spec.slides.length > 9) errs.push("2–9 story slides (the Tradr slide is added after)");
  if (spec.slides?.[0]?.type !== "hook") errs.push("slide 1 must be the hook");
  if (!spec.caption?.trim()) errs.push("caption");
  if (!spec.x?.trim()) errs.push("X text");
  if (spec.x && spec.x.length > 280) errs.push(`X text is ${spec.x.length} characters (max 280)`);
  if (/https?:\/\//.test(spec.x || "")) errs.push("X text must have no links");
  if (!spec.sources?.length) errs.push("at least one source link");
  if (!spec.photos?.length) errs.push("photo sources");
  if (errs.length) throw new Error("Spec incomplete: " + errs.join("; "));
}

async function publish(specPath: string) {
  const raw = JSON.parse(await readFile(specPath, "utf8")) as Spec;
  check(raw);
  const { spec, slides } = await renderSpec(specPath);
  const existing = spec.draftId ? await getNews(spec.draftId) : null;
  const id = existing?.id ?? uid();
  const version = (existing?.version ?? 0) + 1;
  const out: NewsSlide[] = [];
  for (const [i, s] of slides.entries()) {
    const key = `news/${id}/v${version}-${i + 1}`;
    if (s.kind === "video") {
      out.push({
        kind: "video", w: 1080, h: 1350, duration: s.duration ?? null,
        url: await upload(s.file, key + ".mp4", "video/mp4"),
        poster: s.poster ? await upload(s.poster, key + ".poster.jpg", "image/jpeg") : null,
      });
    } else out.push({ kind: "image", w: 1080, h: 1350, url: await upload(s.file, key + ".jpg", "image/jpeg") });
  }
  const fields = {
    title: spec.title, tag: spec.tag, slides: out, caption: spec.caption.trim(), x: spec.x.trim(),
    sources: spec.sources, photos: spec.photos, confirmed: spec.confirmed || [], reported: spec.reported || [],
  };
  let draftId: string;
  if (existing) {
    const d = await mutateNews(existing.id, (d) => {
      Object.assign(d, fields);
      d.status = "draft";
      d.history.push({ at: Date.now(), what: `Redone (v${version})${d.changeNote ? ` for: ${d.changeNote}` : ""}` });
      d.changeNote = "";
      d.version = version;
      (d as unknown as { spec: Spec }).spec = { ...spec, draftId: d.id };
    });
    draftId = d.id;
  } else {
    const d = await createNews({
      ...fields, status: "draft", changeNote: "", history: [{ at: Date.now(), what: "Drafted" }], version,
      suggestionId: spec.suggestionId ?? null, approvedAt: null, postedAt: null,
    });
    await mutateNews(d.id, (x) => void ((x as unknown as { spec: Spec }).spec = { ...spec, draftId: d.id }));
    draftId = d.id;
  }
  if (spec.suggestionId) {
    await mutateSuggestion(spec.suggestionId, (s) => {
      s.status = "done"; s.draftId = draftId; s.note = "";
    }).catch(() => console.warn("suggestion not found:", spec.suggestionId));
  }
  // Remember the id next to the spec so a later redo updates the same draft.
  await writeFile(specPath, JSON.stringify({ ...raw, draftId }, null, 2));
  console.log(JSON.stringify({ draftId, version, slides: out.length }));
}

async function main() {
  switch (cmd) {
    case "inbox": {
      const [sugs, drafts, desk] = await Promise.all([listSuggestions(), listNews(), getNewsDesk()]);
      const changes = drafts.filter((d) => d.status === "changes");
      const unseenRefs = desk.refs.filter((r) => !desk.guideRefIds.includes(r.id));
      console.log(JSON.stringify({
        suggestions: sugs.filter((s) => s.status === "queued").sort((a, b) => a.createdAt - b.createdAt).map(({ id, text, url }) => ({ id, text, url })),
        changeRequests: changes.map((d) => ({ draftId: d.id, title: d.title, note: d.changeNote, spec: (d as unknown as { spec?: Spec }).spec ?? null })),
        styleRefsNotInGuide: unseenRefs.map((r) => ({ id: r.id, url: r.url, note: r.note })),
        guide: desk.guide,
        endSlide: desk.endOptions.find((o) => o.id === desk.endChoice) ?? desk.endOptions[0] ?? null,
        endChosen: !!desk.endChoice,
        recentStories: drafts.filter((d) => Date.now() - d.createdAt < 4 * 864e5).map((d) => ({ title: d.title, status: d.status, at: new Date(d.createdAt).toISOString() })),
      }, null, 2));
      break;
    }
    case "publish":
      await publish(args[0]);
      break;
    case "collab": {
      // collab <draftId> [YYYY-MM-DD] [handle]: the day's one collab post; any other draft marked for that day is cleared.
      const [id, dayArg, handle = "range.fx"] = args;
      const day = dayArg || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      for (const d of await listNews()) {
        if (d.id !== id && d.collab?.day === day) await mutateNews(d.id, (x) => { x.collab = null; });
      }
      await mutateNews(id, (x) => { x.collab = { handle, day }; x.history.push({ at: Date.now(), what: `Marked as the ${day} collab with @${handle}` }); });
      console.log(`collab: ${id} on ${day} with @${handle}`);
      break;
    }
    case "skip":
      await mutateSuggestion(args[0], (s) => {
        s.status = "skipped"; s.note = args.slice(1).join(" ").slice(0, 500);
      });
      console.log("skipped");
      break;
    case "refs": {
      const dir = args[0];
      await mkdir(dir, { recursive: true });
      const desk = await getNewsDesk();
      for (const r of desk.refs) {
        const res = await fetch(r.url);
        await writeFile(path.join(dir, `${r.id}.jpg`), Buffer.from(await res.arrayBuffer()));
      }
      console.log(JSON.stringify(desk.refs.map((r) => ({ id: r.id, file: path.join(dir, `${r.id}.jpg`), note: r.note })), null, 2));
      break;
    }
    case "guide": {
      const md = await readFile(args[0], "utf8");
      await mutateNewsDesk((d) => {
        d.guide = md; d.guideUpdatedAt = Date.now(); d.guideRefIds = d.refs.map((r) => r.id);
      });
      console.log("guide saved");
      break;
    }
    case "ends": {
      const ends = JSON.parse(await readFile(args[0], "utf8")) as { line: string; sub: string }[];
      const dir = path.join(path.dirname(path.resolve(args[0])), "ends");
      const files = await renderEnds(ends.map((e) => ({ type: "end" as const, ...e })), dir);
      const options: EndOption[] = [];
      for (const [i, f] of files.entries()) {
        options.push({ id: `end-${i + 1}-${Date.now()}`, ...ends[i], url: await upload(f, `news/end/end-${i + 1}.jpg`, "image/jpeg") });
      }
      await mutateNewsDesk((d) => {
        d.endOptions = options; d.endChoice = options.length === 1 ? options[0].id : null;
      });
      console.log(JSON.stringify(options, null, 2));
      break;
    }
    case "summary":
      await mutateNewsDesk((d) => {
        d.lastRunAt = Date.now(); d.lastRunSummary = args.join(" ").slice(0, 2000);
      });
      console.log("ok");
      break;
    default:
      console.log("commands: inbox | publish <spec> | collab <draftId> [day] [handle] | skip <id> <reason> | refs <dir> | guide <md> | ends <json> | summary <text>");
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

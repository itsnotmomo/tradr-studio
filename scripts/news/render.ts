// Renders a story spec into finished slides (1080 × 1350 JPEGs, MP4 for video slides).
// Usage: npx tsx scripts/news/render.ts <dir>/spec.json      → writes <dir>/out/1.jpg, 2.mp4, …
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, type Browser } from "playwright-core";
import { cardHtml, endHtml, hookHtml, H, W, type Card, type End, type Hook } from "./templates";

const run = promisify(execFile);
export const UA = "TradrStudioNews/1.0 (https://tradr.me; news desk)";
const ROOT = path.resolve(import.meta.dirname, "../..");
const CUTOUT_BIN = path.join(ROOT, ".news/bin/cutout");

export type Spec = {
  slug: string;
  title: string;
  tag: string;
  slides: (Hook | Card)[];
  caption: string;
  x: string;
  sources: { label: string; url: string }[];
  photos: { what: string; url: string; page?: string; credit: string; license?: string }[];
  confirmed: string[];
  reported: string[];
  /** Set when this redoes an existing draft (change request) */
  draftId?: string;
  /** Suggestion this story came from */
  suggestionId?: string;
};

export type Rendered = { file: string; kind: "image" | "video"; poster?: string; duration?: number };

/** Remote files are fetched once into <dir>/assets. */
async function local(dir: string, p: string) {
  if (!/^https?:/.test(p)) return path.resolve(dir, p);
  const name = p.split("?")[0].split("/").pop()!.replace(/[^\w.-]/g, "_").slice(-80) || "file";
  const out = path.join(dir, "assets", name);
  if (existsSync(out)) return out;
  await mkdir(path.dirname(out), { recursive: true });
  const res = await fetch(p, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${p}`);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return out;
}

async function cutout(input: string) {
  if (!existsSync(CUTOUT_BIN)) {
    await mkdir(path.dirname(CUTOUT_BIN), { recursive: true });
    await run("swiftc", ["-O", path.join(import.meta.dirname, "cutout.swift"), "-o", CUTOUT_BIN]);
  }
  const out = input.replace(/\.\w+$/, "") + ".cut.png";
  if (!existsSync(out)) await run(CUTOUT_BIN, [input, out]);
  return out;
}

async function shoot(browser: Browser, html: string, file: string, type: "jpeg" | "png", workdir: string) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const htmlFile = file.replace(/\.\w+$/, ".html");
  await writeFile(htmlFile, html);
  await page.goto("file://" + htmlFile);
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  const box = await page.evaluate(() => {
    const v = document.getElementById("video");
    if (!v) return null;
    const r = v.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 93 } : {}) });
  await page.close();
  void workdir;
  return box;
}

/** Cuts [start, end] out of a clip (local file or any page yt-dlp understands). */
async function clip(dir: string, m: { src: string; start?: string; end?: string }) {
  const out = path.join(dir, "assets", `clip-${(m.start ?? "0").replace(/:/g, "")}-${path.basename(m.src).replace(/[^\w]/g, "").slice(-24)}.mp4`);
  if (existsSync(out)) return out;
  await mkdir(path.dirname(out), { recursive: true });
  if (/^https?:/.test(m.src) && !/\.(mp4|mov)(\?|$)/i.test(m.src)) {
    const section = m.start && m.end ? ["--download-sections", `*${m.start}-${m.end}`, "--force-keyframes-at-cuts"] : [];
    await run("yt-dlp", ["-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4", ...section, "-o", out, m.src], { maxBuffer: 1 << 26 });
    return out;
  }
  const file = await local(dir, m.src);
  if (!m.start) return file;
  await run("ffmpeg", ["-y", "-ss", m.start, ...(m.end ? ["-to", m.end] : []), "-i", file, "-c:v", "libx264", "-c:a", "aac", out]);
  return out;
}

async function duration(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(stdout) || 0;
}

/** Lays the clip into the card's video box. Instagram carousel video: H.264/AAC, 30 fps, ≤ 60 s. */
async function composeVideo(bg: string, src: string, box: { x: number; y: number; w: number; h: number }, out: string) {
  const d = Math.min(59, await duration(src));
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", src]);
  const hasAudio = stdout.trim().length > 0;
  const filter = `[1:v]scale=${box.w}:${box.h}:force_original_aspect_ratio=increase,crop=${box.w}:${box.h},setsar=1[v];[0:v][v]overlay=${box.x}:${box.y}:shortest=1,format=yuv420p[o]`;
  await run("ffmpeg", [
    "-y", "-loop", "1", "-framerate", "30", "-i", bg, "-i", src,
    ...(hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]),
    "-filter_complex", filter, "-map", "[o]", "-map", hasAudio ? "1:a:0" : "2:a:0",
    "-t", String(d), "-r", "30", "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", out,
  ], { maxBuffer: 1 << 26 });
  const poster = out.replace(/\.mp4$/, ".poster.jpg");
  await run("ffmpeg", ["-y", "-ss", String(Math.min(1, d / 2)), "-i", out, "-frames:v", "1", "-q:v", "3", poster]);
  return { poster, duration: d };
}

export async function renderSpec(specPath: string, opts: { end?: End } = {}) {
  const dir = path.dirname(path.resolve(specPath));
  const spec = JSON.parse(await readFile(specPath, "utf8")) as Spec;
  const outDir = path.join(dir, "out");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
  const done: Rendered[] = [];
  try {
    for (const [i, raw] of spec.slides.entries()) {
      const n = i + 1;
      if (raw.type === "hook") {
        const s: Hook = { ...raw, tag: raw.tag || spec.tag, photo: raw.photo ? await local(dir, raw.photo) : undefined };
        if (s.mode === "cutout" && s.photo) s.cutout = await cutout(s.photo);
        const file = path.join(outDir, `${n}.jpg`);
        await shoot(browser, hookHtml(s), file, "jpeg", dir);
        done.push({ file, kind: "image" });
        continue;
      }
      const s: Card = structuredClone(raw);
      if (s.quote?.photo) s.quote.photo = await local(dir, s.quote.photo);
      if (s.media?.kind === "image") s.media.src = await local(dir, s.media.src);
      if (s.media?.kind === "video") {
        const bg = path.join(outDir, `${n}.bg.png`);
        const box = await shoot(browser, cardHtml(s), bg, "png", dir);
        if (!box) throw new Error(`Slide ${n}: no video box`);
        const src = await clip(dir, s.media);
        const file = path.join(outDir, `${n}.mp4`);
        const v = await composeVideo(bg, src, box, file);
        done.push({ file, kind: "video", ...v });
        continue;
      }
      const file = path.join(outDir, `${n}.jpg`);
      await shoot(browser, cardHtml(s), file, "jpeg", dir);
      done.push({ file, kind: "image" });
    }
    if (opts.end) {
      const file = path.join(outDir, `end.jpg`);
      await shoot(browser, endHtml(opts.end), file, "jpeg", dir);
    }
  } finally {
    await browser.close();
  }
  return { spec, slides: done, dir };
}

/** Renders standalone end-slide options into <out>/end-<n>.jpg. */
export async function renderEnds(ends: End[], outDir: string) {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
  const files: string[] = [];
  try {
    for (const [i, e] of ends.entries()) {
      const file = path.join(outDir, `end-${i + 1}.jpg`);
      await shoot(browser, endHtml(e), file, "jpeg", outDir);
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  return files;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) {
  const p = process.argv[2];
  if (!p) throw new Error("usage: render.ts <spec.json>");
  renderSpec(p).then((r) => console.log(JSON.stringify(r.slides, null, 2)));
}

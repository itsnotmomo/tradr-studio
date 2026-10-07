"use client";

import { upload } from "@vercel/blob/client";
import { IMAGE_MAX_WIDTH } from "../rules";
import type { Slide } from "../types";

/**
 * Instagram only takes JPEG. Every image is re-encoded in the browser to a
 * high-quality sRGB JPEG, at most 1440 px wide, before it's stored.
 */
export async function toJpeg(src: Blob, quality = 0.93): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(src).catch(async () => {
    // Older Safari: fall back to <img>
    const url = URL.createObjectURL(src);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  const iw = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
  const ih = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, IMAGE_MAX_WIDTH / iw);
  const w = Math.round(iw * scale), h = Math.round(ih * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode the image"))), "image/jpeg", quality));
  return { blob, w, h };
}

export async function uploadBlob(blob: Blob, pathname: string) {
  const r = await upload(pathname, blob, { access: "public", handleUploadUrl: "/api/upload", contentType: blob.type || undefined });
  return r.url;
}

/** File/Blob → stored JPEG slide. */
export async function uploadSlide(file: Blob, prefix = "slides"): Promise<Slide> {
  const { blob, w, h } = await toJpeg(file);
  const id = crypto.randomUUID();
  const url = await uploadBlob(blob, `${prefix}/${id}.jpg`);
  return { id, url, w, h };
}

export async function uploadSlides(files: Blob[], prefix = "slides") {
  const out: Slide[] = [];
  for (const f of files) out.push(await uploadSlide(f, prefix));
  return out;
}

export const imageFiles = (list: FileList | File[] | null | undefined) => [...(list || [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));

export async function downloadUrl(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ---------- Reel videos ----------

export const isVideoFile = (f: File) => /^video\/(mp4|quicktime)$/.test(f.type) || /\.(mp4|mov)$/i.test(f.name);

/** Size and duration, plus a JPEG frame (about 1 s in) for the planner card. Read from the local file. */
export async function probeVideo(file: File, opts?: { sizeOnly?: boolean }): Promise<{ w: number; h: number; duration: number; frame: Blob | null }> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    // Size comes from the metadata alone; no need to decode anything for the check.
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("This browser can't read the video. Export it from CapCut as MP4 and try again."));
    });
    const w = v.videoWidth, h = v.videoHeight, duration = v.duration || 0;
    if (opts?.sizeOnly) return { w, h, duration, frame: null };
    await new Promise<void>((res) => {
      if (v.readyState >= 2) return res();
      v.onloadeddata = () => res();
      setTimeout(res, 4000);
    });
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      v.currentTime = Math.min(1, duration / 2 || 0);
      setTimeout(res, 3000);
    });
    let frame: Blob | null = null;
    try {
      const scale = Math.min(1, 1080 / w);
      const c = document.createElement("canvas");
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      frame = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
    } catch {
      /* some codecs can't be drawn; the card just has no picture */
    }
    return { w, h, duration, frame };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Uploads straight to storage in parallel parts, reporting progress (0–100). */
export async function uploadVideo(file: File, onProgress: (pct: number) => void) {
  const ext = /\.mov$/i.test(file.name) || file.type === "video/quicktime" ? "mov" : "mp4";
  const r = await upload(`videos/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: ext === "mov" ? "video/quicktime" : "video/mp4",
    multipart: true,
    clientPayload: JSON.stringify({ size: file.size }),
    onUploadProgress: (p) => onProgress(Math.round(p.percentage)),
  });
  return r.url;
}

// ---------- 1080 × 1920 rule (also enforced on the server) ----------

export const REEL_W = 1080, REEL_H = 1920;

export function reelSizeProblem(kind: "video" | "cover", w: number, h: number) {
  if (w === REEL_W && h === REEL_H) return null;
  const shape = w > h ? "horizontal" : w === h ? "square" : "vertical, but the wrong size";
  const fix = kind === "video" ? "in CapCut set Resolution 1080p, ratio 9:16." : "export the cover at 1080 × 1920.";
  return `This ${kind} is ${w} × ${h} (${shape}). Reels need 1080 × 1920 — ${fix}`;
}

export async function imageSize(file: Blob) {
  const bmp = await createImageBitmap(file);
  const out = { w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
}

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

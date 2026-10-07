import "server-only";

// Reads dimensions straight from stored files, without downloading whole videos:
// MP4/MOV — walk the top-level boxes with range requests, fetch only `moov`, read the video
// track's `tkhd` (width/height + rotation matrix). JPEG — read the SOF header.

async function range(url: string, start: number, end: number) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok && res.status !== 206) throw new Error(`fetch ${res.status}`);
  const total = Number(res.headers.get("content-range")?.split("/")[1]) || Number(res.headers.get("content-length")) || 0;
  return { buf: new Uint8Array(await res.arrayBuffer()), total };
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const i32 = (b: Uint8Array, o: number) => u32(b, o) | 0;
const type = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function children(b: Uint8Array, start: number, end: number) {
  const out: { type: string; start: number; end: number }[] = [];
  for (let o = start; o + 8 <= end; ) {
    let size = u32(b, o);
    let header = 8;
    if (size === 1) {
      size = u32(b, o + 8) * 2 ** 32 + u32(b, o + 12);
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header) break;
    out.push({ type: type(b, o + 4), start: o + header, end: Math.min(end, o + size) });
    o += size;
  }
  return out;
}

function videoTrackDims(moov: Uint8Array) {
  for (const trak of children(moov, 0, moov.length).filter((x) => x.type === "trak")) {
    const kids = children(moov, trak.start, trak.end);
    const mdia = kids.find((x) => x.type === "mdia");
    const hdlr = mdia && children(moov, mdia.start, mdia.end).find((x) => x.type === "hdlr");
    if (!hdlr || type(moov, hdlr.start + 8) !== "vide") continue;
    const tkhd = kids.find((x) => x.type === "tkhd");
    if (!tkhd) continue;
    const v = moov[tkhd.start];
    const m = tkhd.start + 4 + (v === 1 ? 32 : 20) + 16; // matrix
    const w = u32(moov, m + 36) >>> 16, h = u32(moov, m + 40) >>> 16;
    const a = i32(moov, m), b = i32(moov, m + 4);
    const rotated = a === 0 && Math.abs(b) === 0x10000; // 90° / 270°
    return rotated ? { w: h, h: w } : { w, h };
  }
  return null;
}

export async function videoDims(url: string) {
  let o = 0, total = Infinity;
  for (let i = 0; i < 32; i++) {
    const r = await range(url, o, o + 15);
    if (r.total) total = r.total;
    const b = r.buf;
    if (b.length < 8) return null;
    const size = u32(b, 0), t = type(b, 4);
    const header = size === 1 ? 16 : 8;
    const big = size === 1 ? u32(b, 8) * 2 ** 32 + u32(b, 12) : size === 0 ? total - o : size;
    if (big < header) return null;
    if (t === "moov") {
      if (big > 64 * 1024 * 1024) throw new Error("moov too large");
      return videoTrackDims((await range(url, o + header, o + big - 1)).buf);
    }
    o += big;
    if (o >= total) return null;
  }
  return null;
}

export async function jpegDims(url: string) {
  const { buf } = await range(url, 0, 131071);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let o = 2; o + 9 < buf.length; ) {
    if (buf[o] !== 0xff) return null;
    const marker = buf[o + 1];
    const len = (buf[o + 2] << 8) | buf[o + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: (buf[o + 5] << 8) | buf[o + 6], w: (buf[o + 7] << 8) | buf[o + 8] };
    }
    o += 2 + len;
  }
  return null;
}

"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AddToPost } from "@/components/add-to-post";
import { ToolFonts } from "@/components/tool-fonts";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { useAppState } from "@/lib/client/state";
import { canvasBlob, downloadBlob, loadImage, stamp, useToolState } from "@/lib/client/tools";
import { uploadBlob } from "@/lib/client/upload";
import { drawTweet, TWEET_DEFAULTS, TWEET_WIDTH, font, type TweetAssets, type TweetState } from "@/lib/tools/tweet";
import { LANGS } from "@/lib/langs";
import type { Lang } from "@/lib/types";

export default function TweetPage() {
  return <Suspense><Tweet /></Suspense>;
}

function Tweet() {
  const params = useSearchParams();
  const postId = params.get("post");
  const { data } = useAppState();
  const target = data?.posts.find((p) => p.id === postId);
  const toast = useToast();
  const { state: S, update, loaded } = useToolState<TweetState>("tweet", TWEET_DEFAULTS);
  const canvas = useRef<HTMLCanvasElement>(null);
  const assets = useRef<TweetAssets>({ avatar: null, grok: null, customReg: false, customBold: false });
  const faces = useRef<{ reg?: FontFace; bold?: FontFace }>({});
  const [info, setInfo] = useState("");
  const [assetsVer, setAssetsVer] = useState(0);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  // Load images and custom fonts whenever their URLs change.
  useEffect(() => {
    let off = false;
    (async () => {
      const a = assets.current;
      a.avatar = S.avatar ? await loadImage(S.avatar).catch(() => null) : null;
      a.grok = S.grok ? await loadImage(S.grok).catch(() => null) : null;
      for (const [which, url, fam] of [["reg", S.fontReg, "TapeTweetBody"], ["bold", S.fontBold, "TapeTweetName"]] as const) {
        if (faces.current[which]) document.fonts.delete(faces.current[which]!);
        faces.current[which] = undefined;
        if (url) {
          try {
            const ff = new FontFace(fam, `url(${url})`);
            await ff.load();
            document.fonts.add(ff);
            faces.current[which] = ff;
          } catch {
            toast("That font file couldn't be read. Try a .ttf or .otf.", { tone: "error" });
          }
        }
      }
      a.customReg = !!faces.current.reg;
      a.customBold = !!faces.current.bold;
      if (!off) setAssetsVer((v) => v + 1);
    })();
    return () => {
      off = true;
    };
  }, [S.avatar, S.grok, S.fontReg, S.fontBold, toast]);

  const ensureFonts = useCallback(async () => {
    const a = assets.current;
    await Promise.all([document.fonts.load(font(a, "name", 34)), document.fonts.load(font(a, "body", 34)), document.fonts.load(font(a, "meta", 34))]).catch(() => {});
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      await ensureFonts();
      if (off || !canvas.current) return;
      const c = canvas.current;
      if (c.height !== Number(S.height)) c.height = Number(S.height) || 1350;
      const b = drawTweet(c.getContext("2d")!, S, assets.current, S.texts[S.active], true);
      setInfo(`Text ${b.size.toFixed(1)}px, ${b.lines.length} line${b.lines.length === 1 ? "" : "s"}${b.forced ? ". Shrunk extra to fit — consider shortening." : ""}`);
    })();
    return () => {
      off = true;
    };
  }, [S, assetsVer, ensureFonts]);

  const render = useCallback(async (k: Lang) => {
    await ensureFonts();
    const c = document.createElement("canvas");
    c.width = TWEET_WIDTH;
    c.height = Number(S.height) || 1350;
    drawTweet(c.getContext("2d")!, S, assets.current, S.texts[k], false);
    return canvasBlob(c, "image/png");
  }, [S, ensureFonts]);

  const withText = LANGS.map((l) => l.k).filter((k) => (S.texts[k] || "").trim());
  const set = <K extends keyof TweetState>(k: K, v: TweetState[K]) => update((s) => ({ ...s, [k]: v }));

  const uploadAsset = async (key: "avatar" | "grok" | "fontReg" | "fontBold", f: File) => {
    setUploading(key);
    try {
      const isFont = key.startsWith("font");
      const url = await uploadBlob(f, `${isFont ? "fonts" : "tools"}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "")}`);
      update((s) => ({ ...s, [key]: url, ...(isFont ? { [key + "Name"]: f.name } : {}) }));
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setUploading(null);
    }
  };

  if (!loaded) return <div className="p-6 flex items-center gap-2 muted"><Spinner /> Loading…</div>;

  const fileRow = (key: "avatar" | "grok" | "fontReg" | "fontBold", label: string, accept: string, name: string) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <label className="btn small cursor-pointer">{uploading === key ? <Spinner /> : "Upload"}<input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadAsset(key, f); }} /></label>
        <span className="text-[12px] muted truncate flex-1">{name}</span>
        {S[key] && <button className="btn small ghost" onClick={() => set(key, null)}>Remove</button>}
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[400px_1fr] min-h-dvh">
      <ToolFonts />
      <form className="order-2 lg:order-1 border-r p-4 md:p-6 flex flex-col gap-6 lg:max-h-dvh lg:overflow-auto" style={{ background: "var(--panel)", borderColor: "var(--line)" }} onSubmit={(e) => e.preventDefault()} autoComplete="off">
        <h1 className="font-bold text-[17px] hidden lg:block">Tweet card</h1>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Text</legend>
          <div className="seg self-start" role="group" aria-label="Language">
            {LANGS.map((l) => <button key={l.k} type="button" aria-pressed={S.active === l.k} onClick={() => set("active", l.k)}>{l.code}{(S.texts[l.k] || "").trim() ? " •" : ""}</button>)}
          </div>
          <textarea className="field" rows={7} value={S.texts[S.active] || ""} onChange={(e) => update((s) => ({ ...s, texts: { ...s.texts, [s.active]: e.target.value } }))} spellCheck />
          <div className="text-[12px] muted">{(S.texts[S.active] || "").length} characters</div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Account</legend>
          <div className="grid grid-cols-[1.3fr_1.3fr_.8fr] gap-2">
            <div><label className="label" htmlFor="t_name">Name</label><input id="t_name" className="field" value={S.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><label className="label" htmlFor="t_handle">Username</label><input id="t_handle" className="field" value={S.handle} onChange={(e) => set("handle", e.target.value)} autoCapitalize="none" /></div>
            <div><label className="label" htmlFor="t_time">Time</label><input id="t_time" className="field" value={S.time} onChange={(e) => set("time", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="chk" checked={S.verified} onChange={(e) => set("verified", e.target.checked)} /> Verified badge</label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="chk" checked={S.ring} onChange={(e) => set("ring", e.target.checked)} /> Thin ring around profile picture</label>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-semibold text-[13px] mb-2">Images</legend>
          {fileRow("avatar", "Profile picture", "image/*", S.avatar ? "Uploaded" : "None")}
          {fileRow("grok", "Top-right icon (next to the three dots)", "image/*", S.grok ? "Uploaded" : "None")}
          <div className="text-[12px] muted">Use a PNG with a transparent background. If empty, the spot stays blank in the export.</div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Numbers</legend>
          <div className="grid grid-cols-4 gap-2">
            {([["reply", "Replies"], ["repost", "Reposts"], ["like", "Likes"], ["views", "Views"]] as const).map(([k, l]) => (
              <div key={k}><label className="label" htmlFor={`c_${k}`}>{l}</label><input id={`c_${k}`} className="field" inputMode="decimal" value={S.counts[k]} onChange={(e) => update((s) => ({ ...s, counts: { ...s.counts, [k]: e.target.value } }))} /></div>
            ))}
          </div>
          <div className="text-[12px] muted">Type the full number (27000, 806000). It’s shortened the way X does: 27k, 806k, 1.8M. Leave empty to show only the icon.</div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="chk" checked={S.upper} onChange={(e) => set("upper", e.target.checked)} /> Capital K and M</label>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold text-[13px] mb-2">Text size</legend>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="t_max">Short tweets (px)</label><input id="t_max" type="number" className="field" min={16} max={60} step={0.5} value={S.maxSize} onChange={(e) => set("maxSize", Number(e.target.value))} /></div>
            <div><label className="label" htmlFor="t_min">Long tweets (px)</label><input id="t_min" type="number" className="field" min={16} max={60} step={0.5} value={S.minSize} onChange={(e) => set("minSize", Number(e.target.value))} /></div>
          </div>
          <div className="text-[12px] muted">Up to 120 characters uses the first size, shrinking gradually to the second at 480.</div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold text-[13px] mb-2">Canvas</legend>
          <select className="field" value={S.height} onChange={(e) => set("height", Number(e.target.value))} aria-label="Canvas size">
            <option value={1350}>1080 × 1350 (4:5)</option>
            <option value={1440}>1080 × 1440 (3:4) — too tall for the Instagram API</option>
            <option value={1080}>1080 × 1080 (1:1)</option>
          </select>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-semibold text-[13px] mb-2">Fonts</legend>
          <div className="text-[12px] muted -mt-1">Inter is the default. Upload your own files to use Chirp or anything else.</div>
          {fileRow("fontReg", "Text, username and numbers", ".ttf,.otf,.woff,.woff2", S.fontReg ? S.fontRegName || "Custom" : "Inter Medium")}
          {fileRow("fontBold", "Name (bold)", ".ttf,.otf,.woff,.woff2", S.fontBold ? S.fontBoldName || "Custom" : "Inter Bold")}
        </fieldset>
      </form>

      <main className="order-1 lg:order-2 lg:sticky lg:top-0 lg:h-dvh flex flex-col items-center justify-center gap-3 p-4 md:p-7">
        <canvas ref={canvas} width={TWEET_WIDTH} height={1350} aria-label="Preview" className="w-full max-w-[440px] lg:max-w-none lg:w-auto lg:max-h-[calc(100dvh-150px)] h-auto shadow-[0_0_0_1px_rgba(0,0,0,.18)]" />
        <div className="text-[12px] muted text-center min-h-[18px]">{info}</div>
        <div className="flex flex-wrap gap-2 justify-center">
          <button className="btn primary" disabled={!withText.length} onClick={() => setSending(true)}>
            {target ? `Add to “${target.title || "Untitled"}”` : "Add to a post"}
          </button>
          <button className="btn" onClick={async () => downloadBlob(await render(S.active), `tweet-${stamp()}-${S.active}.png`)}>Download {S.active.toUpperCase()}</button>
          <button className="btn" disabled={!withText.length} onClick={async () => {
            const ts = stamp();
            for (const k of withText) {
              downloadBlob(await render(k), `tweet-${ts}-${k}.png`);
              await new Promise((r) => setTimeout(r, 400));
            }
          }}>Download all</button>
        </div>
      </main>
      <AddToPost open={sending} onClose={() => setSending(false)} render={render} available={withText} targetPostId={postId} />
    </div>
  );
}

// The poster: works the News "Post" button on this Mac (16 Nov 2026).
//
// Instagram: Meta's API can't schedule an Instagram post and can't add music, so the carousel is scheduled in
// Instagram's own web scheduler (instagram.com → Create → Post → Schedule content), at the time picked with the Post
// button (default 24 h; 17 Nov 2026). That is a real
// scheduled post: it shows on the phone under Profile → ☰ → Scheduled content, where the music is added.
// X: no API keys, so the tweet is posted from x.com in the same browser.
// Both run in a dedicated Chrome profile (PROFILE below) that is signed in to @tradr__app and @tradr_app once.
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts login        sign in once
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts run          keep working the queue
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts once <id>   one draft, now
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts xdry <id>     X test: fill, attach, discard
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts xcheck       daily X sign-in check
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts dry <id> [igAt ms]
//        test run: fills Instagram's scheduler for the draft's picked time (or igAt) and checks it, then closes the
//        dialog WITHOUT scheduling; no tweet, nothing saved on the draft.
// The launchd agent `me.tradr.media-poster` runs `run` in the background (scripts/news/poster.plist);
// `me.tradr.media-xcheck` runs `xcheck` every day at 09:00 (scripts/news/xcheck.plist).
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Locator, type Page, type Response } from "playwright-core";
import { noteSara } from "./office-note";
import { getNews, getNewsDesk, listNews, mutateNews, queuedNewsIds, syncQueuedNews } from "../../src/lib/server/store";
import { sendNtfy } from "../../src/lib/server/notify";
import { endSlideOf, isReel, type NewsDraft } from "../../src/lib/news";

// POSTER_PROFILE: another profile folder, for tests on a COPY of the real one (24 Nov 2026).
const PROFILE = process.env.POSTER_PROFILE || path.join(os.homedir(), "Library/Application Support/TradrMediaPoster");
const IG_HANDLE = "tradr__app";
const X_HANDLE = "tradr_app";
const TZ = "Europe/Rome";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function browser(): Promise<BrowserContext> {
  await mkdir(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    timezoneId: TZ,
    locale: "en-GB", // 24-hour time in Instagram's scheduler
    viewport: { width: 1360, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

/** Rome date/time parts of a moment. */
function rome(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return { year: p.year, month: p.month, day: Number(p.day), hour: p.hour, minute: p.minute };
}

async function files(d: NewsDraft) {
  const desk = await getNewsDesk();
  // A Reel (24 Nov 2026) is its one video, with no end slide.
  const end = isReel(d) ? null : endSlideOf(desk);
  const urls = [...d.slides.map((s) => s.url), ...(end ? [end.url] : [])];
  // Video slides go up as .mp4 (18 Nov 2026): Instagram's carousel and X both take them.
  const kinds = [...d.slides.map((s) => s.kind), ...(end ? ["image"] : [])];
  const dir = path.join(os.tmpdir(), "tradr-poster", d.id);
  await mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (const [i, u] of urls.entries()) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Couldn't download slide ${i + 1} (${r.status}).`);
    const f = path.join(dir, `${String(i + 1).padStart(2, "0")}.${kinds[i] === "video" ? "mp4" : "jpg"}`);
    await writeFile(f, Buffer.from(await r.arrayBuffer()));
    out.push(f);
  }
  return out;
}

/** Types text line by line (Enter between lines), so paragraph breaks survive in rich text boxes. */
async function typeLines(page: Page, text: string) {
  for (const [i, line] of text.split("\n").entries()) {
    if (i) await page.keyboard.press("Enter");
    if (line) await page.keyboard.insertText(line);
  }
}
const lines = (t: string) => t.replace(/\u00a0/g, " ").split(/\n+/).map((l) => l.trim()).filter(Boolean).join("\n");


/** Closes Instagram's and X's one-off pop-ups ("Turn on notifications", "Save your login info"…) with their "Not now". */
async function dismiss(page: Page) {
  // X's personalised-ads consent sheet (18 Nov 2026) covers the compose box: take the "less relevant ads" option.
  const ads = page.getByRole("button", { name: /^(Continua con annunci meno pertinenti|Continue with less relevant ads)$/ }).first();
  if (await ads.isVisible({ timeout: 1500 }).catch(() => false)) { await ads.click().catch(() => {}); await sleep(1000); }
  // X's one-off notices after a video upload ("Ecco i video scaricabili" → "Ho capito").
  const got = page.getByRole("button", { name: /^(Ho capito|Got it)$/ }).first();
  if (await got.isVisible({ timeout: 1500 }).catch(() => false)) { await got.click().catch(() => {}); await sleep(1000); }
  for (let i = 0; i < 3; i++) {
    const b = page.getByRole("button", { name: /^(Not now|Not Now)$/ }).first();
    if (!(await b.isVisible({ timeout: 1500 }).catch(() => false))) return;
    await b.click().catch(() => {});
    await sleep(800);
  }
}

/** Whether x.com is signed in as @tradr_app: the nav's Profile link (href "/tradr_app"), language-free, with the old
 *  account button as a fallback (X dropped it in Nov 2026). Waits up to 15 s for the nav; a login page is a plain no. */
async function xSignedIn(page: Page) {
  const own = page.locator(`nav a[href="/${X_HANDLE}" i], [role="navigation"] a[href="/${X_HANDLE}" i]`).first();
  const old = page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').first();
  const login = page.locator('a[href="/login"], a[href*="/i/flow/login"], input[autocomplete="username"]').first();
  for (let i = 0; i < 30; i++) {
    if (/\/(login|i\/flow\/login|logout)/.test(new URL(page.url()).pathname)) return false;
    if (await own.count().catch(() => 0)) return true;
    if ((await old.innerText({ timeout: 200 }).catch(() => "")).includes(`@${X_HANDLE}`)) return true;
    if (i > 10 && (await login.count().catch(() => 0))) return false;
    await sleep(500);
  }
  return false;
}

async function igSignedIn(page: Page) {
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await dismiss(page);
  return page.locator(`img[alt="${IG_HANDLE}'s profile picture"]`).first().isVisible().catch(() => false);
}

/** Instagram refuses anything under 20 minutes ahead; leave a minute for the form. */
const IG_MIN_MS = 21 * 60e3;

/** Schedules the carousel on @tradr__app in Instagram's own scheduler. `dry` stops before the Schedule click. */
async function scheduleInstagram(page: Page, d: NewsDraft, slides: string[], igAt: number, dry = false) {
  if (igAt - Date.now() < IG_MIN_MS) throw new Error("The Instagram time is now less than 20 minutes away (Instagram's minimum). Press Post again and pick a later time.");
  if (!(await igSignedIn(page))) throw new Error(`Instagram isn't signed in as @${IG_HANDLE} in the poster's Chrome. Run the login step.`);
  // Create → Post (the menu toggles; click again if the item isn't there).
  for (let i = 0; i < 3; i++) {
    await page.locator('svg[aria-label="New post"]').first().click();
    const item = page.getByRole("link", { name: /^Post$/ }).or(page.locator("a,div[role=button],span").filter({ hasText: /^Post$/ })).first();
    if (await item.isVisible({ timeout: 2500 }).catch(() => false)) { await item.click(); break; }
  }
  await page.locator('[role="dialog"] input[type="file"]').first().waitFor({ state: "attached", timeout: 15000 });
  await page.locator('[role="dialog"] input[type="file"]').first().setInputFiles(slides);
  // A carousel with a video brings up "Video posts are now shared as reels" first: OK it.
  if (slides.some((f) => f.endsWith(".mp4"))) {
    const ok = page.locator('[role="dialog"]').filter({ hasText: "Video posts are now shared as reels" }).last().getByText("OK", { exact: true });
    if (await ok.waitFor({ timeout: 20000 }).then(() => true, () => false)) { await ok.click(); await sleep(1000); }
  }
  // Crop → Original (the default 1:1 would cut the 4:5 slides).
  const crop = page.locator('[role="dialog"] svg[aria-label="Select crop" i]:visible').first();
  await crop.waitFor({ timeout: 30000 });
  await crop.click();
  await page.locator('[role="dialog"]').getByText("Original", { exact: true }).locator("visible=true").first().click();
  await sleep(700);
  for (let i = 0; i < 2; i++) {
    await page.locator('[role="dialog"]').getByText("Next", { exact: true }).locator("visible=true").first().click();
    await sleep(2000);
  }
  const box = page.locator('[role="dialog"] [role="textbox"][aria-label*="caption" i]').first();
  await box.waitFor({ timeout: 20000 });
  const acct = await page.locator('[role="dialog"]').last().innerText();
  if (!acct.includes(IG_HANDLE)) throw new Error(`The Create dialog isn't on @${IG_HANDLE}.`);

  // Schedule content: on first.
  const sw = page.locator('[role="dialog"] input[role="switch"]');
  const n = await sw.count();
  let flipped = false;
  for (let i = 0; i < n; i++) {
    const label = await sw.nth(i).evaluate((el) => {
      let p: HTMLElement | null = el as HTMLElement;
      for (let k = 0; k < 8 && p; k++) { p = p.parentElement; if (p && /Schedule content|AI label/.test(p.innerText)) return p.innerText; }
      return "";
    });
    if (/^\s*Schedule content/.test(label)) {
      if (!(await sw.nth(i).isChecked())) await sw.nth(i).click({ force: true });
      flipped = true;
    } else if (/AI label/.test(label) && (await sw.nth(i).isChecked())) {
      await sw.nth(i).click({ force: true }); // never the AI label
    }
  }
  if (!flipped) throw new Error("Couldn't find Instagram's Schedule content switch.");
  await page.locator('[role="dialog"]').getByRole("button", { name: "Schedule", exact: true }).first().waitFor({ timeout: 5000 });

  // Caption, typed as text, then read back.
  await box.click();
  await typeLines(page, d.caption);
  await sleep(800);
  await page.locator('[role="dialog"]').getByText(IG_HANDLE, { exact: true }).first().click().catch(() => {}); // closes a hashtag list
  if (lines(await box.innerText()) !== lines(d.caption)) throw new Error("The caption didn't come out exactly as written in Instagram's box.");

  // Collaborator, only for the day's collab post.
  if (d.collab?.handle) {
    const c = page.locator('[role="dialog"] input[aria-label="Add collaborators"]').first();
    await c.click();
    await c.pressSequentially(d.collab.handle, { delay: 60 });
    await sleep(2500);
    const pick = page.locator('[role="dialog"]').getByText(d.collab.handle, { exact: true }).last();
    await pick.click();
    await page.locator('[role="dialog"]').getByRole("button", { name: "Done", exact: true }).last().click().catch(() => {});
  }

  // Date: open the picker, move to the month, click the day.
  const when = rome(igAt);
  const dateField = page.locator('[role="dialog"] [role="button"]').filter({ hasText: /^\w{3}, (\d{1,2} \w{3}|\w{3} \d{1,2}),? \d{4}$/ }).first();
  await dateField.click();
  const cal = page.locator('[role="dialog"]').filter({ has: page.locator('[role="gridcell"]') }).last();
  for (let i = 0; i < 2; i++) { // up to 29 days ahead
    if ((await cal.innerText()).includes(`${when.month} ${when.year}`)) break;
    await cal.getByRole("button", { name: /next month/i }).click();
    await sleep(500);
  }
  const clicked = await cal.evaluate((el, day) => {
    const cells = [...el.querySelectorAll<HTMLElement>('[role="gridcell"]')];
    const first = cells.findIndex((c) => c.innerText.trim() === "1");
    const cell = cells.slice(first).find((c) => c.innerText.trim() === String(day));
    if (!cell || cell.getAttribute("aria-disabled") === "true") return false;
    cell.click();
    return true;
  }, when.day);
  if (!clicked) throw new Error(`Couldn't pick ${when.day} ${when.month} in Instagram's calendar.`);
  await sleep(700);
  // Time: hour, then minutes, two digits each.
  for (const [label, value] of [["Hours", when.hour], ["Minutes", when.minute]] as const) {
    const f = page.locator(`[role="dialog"] input[aria-label="${label}" i]`).first();
    await f.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.type(value, { delay: 80 });
    await sleep(500);
  }
  const text = await page.locator('[role="dialog"]').filter({ hasText: "Schedule content" }).last().innerText();
  const fmt = (loc: string) => new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(igAt).replace(/,/g, "");
  const want = fmt("en-GB");
  const shown = (text.match(/Date\s*\n\s*([^\n]+)/)?.[1] ?? "").replace(/,/g, "").trim();
  // The time shows as text ("Time 17 : 10"); the inputs' values stay empty.
  const tm = text.match(/Time\s*\n?\s*(\d{1,2})\s*\n?\s*:\s*\n?\s*(\d{2})(?!\s*\n?\s*[AP]M)/);
  const hh = tm?.[1] ?? "", mm = tm?.[2] ?? "";
  if ((shown !== want && shown !== fmt("en-US")) || hh.padStart(2, "0") !== when.hour || mm.padStart(2, "0") !== when.minute) {
    throw new Error(`Schedule check failed: Instagram shows ${shown} ${hh}:${mm}, wanted ${want} ${when.hour}:${when.minute}.`);
  }
  if (/at least 20 minutes/i.test(text)) throw new Error("Instagram says the time is too soon.");
  if (dry) {
    log(d.id, `dry run: Instagram shows ${shown} ${hh}:${mm} (wanted ${want} ${when.hour}:${when.minute}); not scheduling`);
    await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", `${d.id}-dry.png`) }).catch(() => {});
    return;
  }

  await page.locator('[role="dialog"]').getByRole("button", { name: "Schedule", exact: true }).first().click();
  await page.getByText(/has been scheduled/i).first().waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Done", exact: true }).first().click().catch(() => {});
}

// ---------- X (rewritten 24 Nov 2026) ----------
// On 23 Nov 2026 X rebuilt its compose box: a plain <textarea> (aria-label = "What's happening?" in the account's
// language, "Che c'è di nuovo?" today), no data-testid on the box, the file input, the attachments or the Post button.
// So nothing below depends on one language or one data-testid: the compose dialog is the [role=dialog] holding a
// textarea, the file input is the dialog's input[type=file], the upload is confirmed from X's own upload replies
// (upload.x.com …/media/upload.json: INIT → APPEND → FINALIZE → STATUS succeeded) and the Post button is found by
// its place in the dialog (the last plain text button; "Post" or a translation preferred).

/** X's upload replies seen on this page: media id → where it stands. */
function watchUploads(page: Page) {
  const media = new Map<string, "uploading" | "processing" | "done" | "failed">();
  let error = "";
  const on = async (r: Response) => {
    let u: URL;
    try { u = new URL(r.url()); } catch { return; }
    if (!/(^|\.)(x|twitter)\.com$/.test(u.hostname) || !/\/media\/upload(\.json)?$/.test(u.pathname)) return;
    const cmd = (u.searchParams.get("command") || "").toUpperCase();
    let id = u.searchParams.get("media_id");
    if (!r.ok()) { error = `X refused the upload (${cmd || "upload"} ${r.status()})`; if (id) media.set(id, "failed"); return; }
    const b = await r.json().catch(() => null);
    if (cmd === "INIT") { id = b?.media_id_string ?? (b?.media_id != null ? String(b.media_id) : id); if (id) media.set(id, "uploading"); return; }
    if (!id) return;
    if (cmd.startsWith("APPEND")) { if (!media.has(id)) media.set(id, "uploading"); return; }
    if (cmd === "FINALIZE" || cmd === "STATUS") {
      const st = b?.processing_info?.state as string | undefined;
      if (st === "failed") { media.set(id, "failed"); error = `X couldn't process the media: ${b?.processing_info?.error?.message ?? b?.processing_info?.error?.name ?? "no reason given"}`; }
      else if (!st || st === "succeeded") media.set(id, "done");
      else media.set(id, "processing");
    }
  };
  page.on("response", on);
  return { media, error: () => error, stop: () => page.off("response", on) };
}

/** The open compose dialog: the [role=dialog] that holds a text box. */
const composeDialog = (page: Page) =>
  page.locator('[role="dialog"]').filter({ has: page.locator('textarea, [role="textbox"], [contenteditable="true"]') }).last();

/** Marks the dialog's Post button (data-tradr-post) and returns its state, or null if there isn't one. */
async function markPostButton(dlg: Locator) {
  return dlg.evaluate((el) => {
    el.querySelectorAll("[data-tradr-post]").forEach((b) => b.removeAttribute("data-tradr-post"));
    const old = el.querySelector<HTMLElement>('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
    const plain = [...el.querySelectorAll<HTMLElement>('button, [role="button"]')].filter((b) => {
      const t = b.innerText.trim();
      const r = b.getBoundingClientRect();
      return t && r.width > 0 && r.height > 0 && !b.getAttribute("aria-haspopup") && (!b.getAttribute("aria-label") || b.getAttribute("aria-label") === t);
    });
    const named = plain.filter((b) => /^(post|pubblica|posta|publicar|publier|posten|veröffentlichen|tweet|twitta)$/i.test(b.innerText.trim()));
    const btn = old ?? named[named.length - 1] ?? plain[plain.length - 1];
    if (!btn) return null;
    btn.setAttribute("data-tradr-post", "1");
    const off = (btn as HTMLButtonElement).disabled || btn.getAttribute("aria-disabled") === "true";
    return { text: btn.innerText.trim(), enabled: !off };
  });
}

/** The new tweet's id in a CreateTweet-style reply (data.create_tweet.tweet_results.result.rest_id, or the note-tweet twin). */
function restIdOf(body: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number): string | null => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 8) return null;
    seen.add(o);
    const r = (o as { tweet_results?: { result?: { rest_id?: unknown; tweet?: { rest_id?: unknown } } } }).tweet_results?.result;
    const id = r?.rest_id ?? r?.tweet?.rest_id;
    if (typeof id === "string" && /^\d+$/.test(id)) return id;
    for (const v of Object.values(o)) { const f = walk(v, depth + 1); if (f) return f; }
    return null;
  };
  return walk((body as { data?: unknown })?.data, 0);
}

/** Closes the compose dialog and discards what's in it (never "Save"), then checks it's gone. */
async function discardCompose(page: Page) {
  const dlg = composeDialog(page);
  if (!(await dlg.count())) return;
  // The close (×) is the dialog's first button; "Close"/"Chiudi" preferred.
  const close = dlg.getByRole("button", { name: /^(close|chiudi|chiudere|cerrar|fermer|schließen)$/i }).first();
  if (await close.count()) await close.click(); else await dlg.locator('button, [role="button"]').first().click();
  // "Save post?" → Discard ("Cestina"). The left / first button of that small dialog is Discard; Save is never pressed.
  const ask = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasNot: page.locator("textarea") }).last();
  if (await ask.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
    const named = ask.getByRole("button", { name: /^(discard|cestina|elimina|scarta|descartar|supprimer|verwerfen)$/i }).first();
    if (await named.count()) await named.click();
    else {
      const btns = ask.locator("button:visible");
      const texts = await btns.allInnerTexts();
      const i = texts.findIndex((t) => t.trim() && !/^(save|salva|guardar|enregistrer|speichern)$/i.test(t.trim()));
      if (i < 0) throw new Error("Couldn't find X's Discard button.");
      await btns.nth(i).click();
    }
  }
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')].some((d) => d.querySelector("textarea")), null, { timeout: 10000 })
    .catch(() => { throw new Error("X's compose box didn't close after Discard."); });
}

/** Posts the tweet with the hook slide (a Reel: its video) from x.com and returns its URL.
 *  `dry`: does everything (text, media, upload, Post button enabled), then discards the draft instead of posting. */
async function postTweet(page: Page, d: NewsDraft, hook: string, { dry = false } = {}): Promise<string> {
  if (process.env.TRADR_POSTER_TEST_X_FAIL) throw new Error(`Test failure (TRADR_POSTER_TEST_X_FAIL): ${process.env.TRADR_POSTER_TEST_X_FAIL}`);
  const uploads = watchUploads(page);
  try {
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await dismiss(page);
    if (!(await xSignedIn(page))) throw new Error(`X isn't signed in as @${X_HANDLE} in the poster's Chrome. Run the login step.`);
    const dlg = composeDialog(page);
    await dlg.waitFor({ timeout: 20000 }).catch(() => { throw new Error("X's compose box didn't open (no dialog with a text box on x.com/compose/post)."); });
    const box = dlg.locator('textarea, [role="textbox"], [contenteditable="true"]').first();
    const plain = (await box.evaluate((el) => el.tagName)) === "TEXTAREA";
    const read = () => box.evaluate((el) => (el instanceof HTMLTextAreaElement ? el.value : (el as HTMLElement).innerText));
    await box.click();
    if ((await read()).trim()) { await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("Backspace"); }
    // A textarea takes the text in one go, line breaks included; a rich box needs Enter between lines.
    if (plain) await page.keyboard.insertText(d.x); else await typeLines(page, d.x);
    await sleep(600);
    if (lines(await read()) !== lines(d.x)) throw new Error("The tweet text didn't come out exactly as written.");

    const input = dlg.locator('input[type="file"]').first();
    await input.waitFor({ state: "attached", timeout: 10000 }).catch(() => { throw new Error("Couldn't find X's media input in the compose box."); });
    await input.setInputFiles(hook);
    // Uploaded = X confirmed every file (FINALIZE, and STATUS "succeeded" for video), the preview is in the box,
    // no progress bar is left, and the Post button is on.
    const until = Date.now() + 5 * 60e3;
    let last = "";
    for (;;) {
      if (uploads.error()) throw new Error(uploads.error());
      const states = [...uploads.media.values()];
      const preview = await dlg.locator('img[src^="blob:"], video').count();
      // The upload's own bar (a <progress>, labelled with the file name); not the character-count ring (role=progressbar, max 280).
      const busy = await dlg.evaluate((el, name) => [...el.querySelectorAll<HTMLElement>('progress, [role="progressbar"]')]
        .filter((p) => p.tagName === "PROGRESS" || (p.getAttribute("aria-label") ?? "").includes(name)).length, path.basename(hook));
      const btn = await markPostButton(dlg);
      last = `uploads ${states.join(",") || "none"}, preview ${preview}, progress ${busy}, Post ${btn ? (btn.enabled ? "on" : "off") : "missing"}`;
      if (states.length && states.every((s) => s === "done") && preview && !busy && btn?.enabled) break;
      if (Date.now() > until) throw new Error(`The ${hook.endsWith(".mp4") ? "video" : "image"} didn't finish uploading to X in 5 minutes (${last}).`);
      await sleep(1000);
    }
    if (lines(await read()) !== lines(d.x)) throw new Error("The tweet text changed while the media uploaded.");
    log(d.id, `x: ready to post (${last})`);
    if (dry) {
      await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", `${d.id}-x-dry.png`) }).catch(() => {});
      await discardCompose(page);
      return "dry run: not posted";
    }

    // Post, then read the new tweet's id from X's reply; a toast link, then the profile, as fallbacks.
    let id: string | null = null;
    let clicked = Date.now();
    const onReply = async (r: Response) => {
      if (id || r.request().method() !== "POST" || !/\/graphql\/[^/]+\/\w*Create\w*Tweet/i.test(r.url())) return;
      id = restIdOf(await r.json().catch(() => null)) ?? id;
    };
    page.on("response", onReply);
    try {
      await dismiss(page);
      clicked = Date.now();
      await dlg.locator("[data-tradr-post]").click();
      const toast = page.locator(`[role="alert"] a[href*="/${X_HANDLE}/status/" i], [role="status"] a[href*="/${X_HANDLE}/status/" i]`).first();
      for (let i = 0; i < 90 && !id; i++) {
        const href = await toast.getAttribute("href", { timeout: 200 }).catch(() => null);
        const m = href?.match(/\/status\/(\d+)/);
        if (m) id = m[1];
        else await sleep(800);
      }
    } finally { page.off("response", onReply); }
    if (!id) id = await findOwnTweet(page, d.x, clicked);
    if (!id) throw new Error(`X didn't confirm the tweet. It MAY have gone out: check x.com/${X_HANDLE} before trying again.`);
    return `https://x.com/${X_HANDLE}/status/${id}`;
  } finally { uploads.stop(); }
}

/** When a tweet was made, from its id (X's ids carry the time). */
const tweetTime = (id: string) => Number(BigInt(id) >> 22n) + 1288834974657;

/** The newest @tradr_app tweet on the profile whose text starts like `text` (fallback when X's reply wasn't read). */
async function findOwnTweet(page: Page, text: string, since: number) {
  const first = lines(text).split("\n")[0].slice(0, 60);
  await page.goto(`https://x.com/${X_HANDLE}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.locator("article").first().waitFor({ timeout: 20000 }).catch(() => {});
  return page.locator("article").evaluateAll((arts, [h, f]) => {
    for (const a of arts.slice(0, 6)) {
      const t = (a as HTMLElement).innerText.replace(/ /g, " ");
      const link = [...a.querySelectorAll<HTMLAnchorElement>(`a[href*="/status/"]`)].find((l) => l.getAttribute("href")!.toLowerCase().startsWith(`/${h}/status/`));
      if (link && t.includes(f)) return link.getAttribute("href")!.match(/\/status\/(\d+)/)?.[1] ?? null;
    }
    return null;
  }, [X_HANDLE.toLowerCase(), first] as const).then((id) => (id && tweetTime(id) >= since - 120e3 ? id : null)).catch(() => null);
}

async function work(ctx: BrowserContext, id: string) {
  let d = await getNews(id);
  if (!d?.post) return;
  const set = (patch: Partial<NonNullable<NewsDraft["post"]>>, what?: string) =>
    mutateNews(id, (x) => {
      if (!x.post) return;
      Object.assign(x.post, patch, { updatedAt: Date.now() });
      if (what) x.history.push({ at: Date.now(), what });
    });
  await set({ state: "running", error: null });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let step: "files" | "ig" | "x" = "files";
  try {
    const slides = await files(d);
    step = "ig";
    d = (await getNews(id))!;
    if (!d.post!.igScheduledAt) {
      log(id, "instagram: scheduling for", new Date(d.post!.igAt).toISOString());
      await scheduleInstagram(page, d, slides, d.post!.igAt);
      await set({ igScheduledAt: Date.now() }, `Instagram scheduled for ${new Date(d.post!.igAt).toISOString()}`);
    }
    if (d.xOff) log(id, "x: off for this draft (Instagram only), no tweet");
    else if (!d.post!.tweetUrl) {
      step = "x";
      log(id, "x: posting");
      const url = await postTweet(page, d, slides[0]);
      await set({ tweetUrl: url }, `Tweet posted: ${url}`);
    }
    await mutateNews(id, (x) => {
      x.post!.state = "done"; x.post!.updatedAt = Date.now();
      x.status = "posted"; x.postedAt = Date.now();
      x.history.push({ at: Date.now(), what: "Posted with the Post button" });
    });
    const p = (await getNews(id))!.post!;
    await sendNtfy("News posted", `${d.title}\nInstagram goes live ${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(p.igAt)} (Rome).${isReel(d) ? "" : " Add the music."}\n${d.xOff ? "X: off (Instagram only)" : `Tweet: ${p.tweetUrl}`}`, `/news?id=${id}`).catch(() => {});
    log(id, "done");
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0].slice(0, 400);
    log(id, "failed:", msg);
    await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", `${id}-fail.png`) }).catch(() => {});
    await set({ state: "failed", error: msg }, `Post failed: ${msg}`);
    await sendNtfy("News post failed", `${d.title}: ${msg}`, `/news?id=${id}`).catch(() => {});
    // An X failure is never quiet (24 Nov 2026): Sara gets a note in HQ, the board shows "X failed".
    if (step === "x") {
      const igDone = !!(await getNews(id).catch(() => null))?.post?.igScheduledAt;
      const r = await noteSara(`X post failed: ${d.title}`.slice(0, 200),
        `The tweet for "${d.title}" (draft ${id}) did not go out.\nError: ${msg}\n${igDone ? "Instagram went through, so the post is on Instagram only for now (not on purpose)." : "Instagram was not scheduled either."} The board shows it as "X failed". Nothing was retried.`,
        `Tradr Media → X → To review (draft ${id.slice(0, 8)})`);
      log(id, r.ok ? `note to Sara: left (X failed): ${r.out}` : `note to Sara failed: ${r.out}`);
    }
  }
}

/** Waits (up to 10 min) while another Chrome has the profile open (the poster working the queue), so the daily check
 *  never fights it for the profile. */
async function waitForProfile() {
  const { readlink } = await import("node:fs/promises");
  for (let i = 0; i < 60; i++) {
    const pid = Number((await readlink(path.join(PROFILE, "SingletonLock")).catch(() => "")).split("-").pop());
    let alive = false;
    if (pid) try { process.kill(pid, 0); alive = true; } catch { /* gone */ }
    if (!alive) return;
    await sleep(10_000);
  }
  throw new Error("the poster's Chrome profile stayed busy for 10 minutes");
}

/** Reads every draft (about 650 KB) and returns the queued ones, oldest first. Also repairs the "news:queued" marker. */
async function queued() {
  const all = await listNews();
  const fixed = await syncQueuedNews(all);
  if (fixed) log(`poster: queue marker repaired for ${fixed} draft${fixed === 1 ? "" : "s"}`);
  return all.filter((d) => d.post?.state === "queued").sort((a, b) => a.post!.requestedAt - b.post!.requestedAt);
}

/** Upstash bandwidth (25 Nov 2026): every 30 s the poster reads only the small "news:queued" marker. It reads every
 *  draft at start-up, when the marker says something is queued, and as a safety net every 30 minutes. */
const FULL_READ_EVERY = 30 * 60e3;

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "login") {
    const ctx = await browser();
    const ig = ctx.pages()[0] ?? (await ctx.newPage());
    await ig.goto("https://www.instagram.com/accounts/login/");
    const x = await ctx.newPage();
    await x.goto("https://x.com/login");
    console.log(`Sign in to Instagram as @${IG_HANDLE} and to X as @${X_HANDLE} in this window, then close it.`);
    await new Promise<void>((r) => ctx.on("close", () => r()));
    return;
  }
  if (cmd === "check") {
    const ctx = await browser();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const ig = await igSignedIn(page);
    await page.goto("https://x.com/home"); await page.waitForTimeout(4000);
    const x = await xSignedIn(page);
    console.log(JSON.stringify({ instagram: ig, x }));
    await ctx.close();
    return;
  }
  if (cmd === "dry") {
    if (!arg) throw new Error("usage: poster.ts dry <draftId> [igAt ms]");
    const d = await getNews(arg);
    if (!d) throw new Error("No such draft.");
    const igAt = Number(process.argv[4] || d.post?.igAt || Date.now() + 24 * 3600e3);
    const ctx = await browser();
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      try {
        await scheduleInstagram(page, d, await files(d), igAt, true);
      } catch (e) {
        await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", `${d.id}-dry-fail.png`) }).catch(() => {});
        throw e;
      }
      console.log(JSON.stringify({ ok: true, igAt, rome: rome(igAt) }));
    } finally { await ctx.close(); }
    return;
  }
  if (cmd === "xdry") {
    // X test run (24 Nov 2026): fills X's compose box with the draft's X text and its hook (a Reel: the video), waits for
    // the upload, checks Post is enabled, then DISCARDS the draft. Never posts, writes nothing on the draft.
    if (!arg) throw new Error("usage: poster.ts xdry <draftId>");
    const d = await getNews(arg);
    if (!d) throw new Error("No such draft.");
    const ctx = await browser();
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      try { console.log(await postTweet(page, d, (await files(d))[0], { dry: true })); }
      catch (e) { await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", `${d.id}-x-dry-fail.png`) }).catch(() => {}); throw e; }
      console.log(JSON.stringify({ ok: true, draft: d.id, posted: false }));
    } finally { await ctx.close(); }
    return;
  }
  if (cmd === "xcheck") {
    // The daily check (launchd me.tradr.media-xcheck, 09:00 Rome; 24 Nov 2026): one x.com page load in the poster's
    // Chrome; if it isn't signed in as @tradr_app (or the check can't run), Sara gets a note. Never posts.
    let problem = "";
    try {
      await waitForProfile();
      const ctx = await browser();
      try {
        const page = ctx.pages()[0] ?? (await ctx.newPage());
        await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 60000 });
        if (!(await xSignedIn(page))) {
          await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", "xcheck-fail.png") }).catch(() => {});
          problem = `X isn't signed in as @${X_HANDLE} in the poster's Chrome (the page shows ${new URL(page.url()).pathname}). Every X post will fail until someone signs in again.`;
        }
      } finally { await ctx.close(); }
    } catch (e) { problem = `The daily X check couldn't run: ${(e as Error).message.split("\n")[0].slice(0, 300)}`; }
    if (process.env.TRADR_XCHECK_TEST_FAIL) problem = `Test failure (TRADR_XCHECK_TEST_FAIL): ${process.env.TRADR_XCHECK_TEST_FAIL}`;
    if (!problem) { log(`xcheck: signed in as @${X_HANDLE}`); return; }
    log("xcheck:", problem);
    const r = await noteSara(`X sign-in check failed (@${X_HANDLE})`, `${problem}\nFix: on the Mac, sign X back in to @${X_HANDLE} in the poster's Chrome (scripts/news/poster.ts login). Nothing was posted.`, "The Mac's poster (me.tradr.media-poster)");
    log(r.ok ? `note to Sara: left (xcheck): ${r.out}` : `note to Sara failed: ${r.out}`);
    process.exitCode = 1;
    return;
  }
  if (cmd === "once") {
    if (!arg) throw new Error("usage: poster.ts once <draftId>");
    const ctx = await browser();
    try { await work(ctx, arg); } finally { await ctx.close(); }
    return;
  }
  if (cmd === "run") {
    log("poster: watching the queue");
    let lastFull = 0;
    for (;;) {
      try {
        const full = Date.now() - lastFull >= FULL_READ_EVERY || (await queuedNewsIds()).length > 0;
        const q = full ? await queued() : [];
        if (full) lastFull = Date.now();
        if (q.length) {
          const ctx = await browser();
          try { for (const d of q) await work(ctx, d.id); } finally { await ctx.close(); }
        }
      } catch (e) {
        log("poster loop error:", (e as Error).message);
      }
      await sleep(30_000);
    }
  }
  console.log("commands: login | check | once <draftId> | dry <draftId> [igAt] | xdry <draftId> | xcheck | run");
}

main().then(() => { if (process.argv[2] !== "run") process.exit(process.exitCode ?? 0); }, (e) => { console.error(e); process.exit(1); });

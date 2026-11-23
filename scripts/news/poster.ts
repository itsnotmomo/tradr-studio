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
//   npx tsx --env-file=.env.local --conditions=react-server scripts/news/poster.ts dry <id> [igAt ms]
//        test run: fills Instagram's scheduler for the draft's picked time (or igAt) and checks it, then closes the
//        dialog WITHOUT scheduling; no tweet, nothing saved on the draft.
// The launchd agent `me.tradr.media-poster` runs `run` in the background (scripts/news/poster.plist).
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { getNews, getNewsDesk, listNews, mutateNews } from "../../src/lib/server/store";
import { sendNtfy } from "../../src/lib/server/notify";
import { endSlideOf, type NewsDraft } from "../../src/lib/news";

const PROFILE = path.join(os.homedir(), "Library/Application Support/TradrMediaPoster");
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
  const end = endSlideOf(desk);
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

/** Posts the tweet with the hook slide from x.com and returns its URL. */
async function postTweet(page: Page, d: NewsDraft, hook: string) {
  await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await dismiss(page);
  const who = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').innerText().catch(() => "");
  if (!who.includes(`@${X_HANDLE}`)) throw new Error(`X isn't signed in as @${X_HANDLE} in the poster's Chrome. Run the login step.`);
  const box = page.locator('[data-testid="tweetTextarea_0"]').first();
  await box.waitFor({ timeout: 20000 });
  await box.click();
  await typeLines(page, d.x);
  await page.locator('input[data-testid="fileInput"]').first().setInputFiles(hook);
  await page.locator('[data-testid="attachments"] img, [data-testid="attachments"] [role="img"], [data-testid="attachments"] video').first().waitFor({ timeout: 60000 });
  if (lines(await box.innerText()) !== lines(d.x)) throw new Error("The tweet text didn't come out exactly as written.");
  const btn = page.locator('[data-testid="tweetButton"]').first();
  await page.waitForFunction(() => document.querySelector('[data-testid="tweetButton"]')?.getAttribute("aria-disabled") !== "true", null, { timeout: 180000 });
  const posted = page.waitForResponse((r) => /CreateTweet/.test(r.url()) && r.request().method() === "POST", { timeout: 60000 });
  await dismiss(page);
  await btn.click();
  const res = await posted;
  const body = await res.json().catch(() => null);
  const id = body?.data?.create_tweet?.tweet_results?.result?.rest_id as string | undefined;
  if (!res.ok() || !id) throw new Error(`X didn't confirm the tweet (${res.status()}).`);
  return `https://x.com/${X_HANDLE}/status/${id}`;
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
  try {
    const slides = await files(d);
    d = (await getNews(id))!;
    if (!d.post!.igScheduledAt) {
      log(id, "instagram: scheduling for", new Date(d.post!.igAt).toISOString());
      await scheduleInstagram(page, d, slides, d.post!.igAt);
      await set({ igScheduledAt: Date.now() }, `Instagram scheduled for ${new Date(d.post!.igAt).toISOString()}`);
    }
    if (!d.post!.tweetUrl) {
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
    await sendNtfy("News posted", `${d.title}\nInstagram goes live ${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(p.igAt)} (Rome). Add the music.\nTweet: ${p.tweetUrl}`, `/news?id=${id}`).catch(() => {});
    log(id, "done");
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0].slice(0, 400);
    log(id, "failed:", msg);
    await page.screenshot({ path: path.join(os.tmpdir(), "tradr-poster", `${id}-fail.png`) }).catch(() => {});
    await set({ state: "failed", error: msg }, `Post failed: ${msg}`);
    await sendNtfy("News post failed", `${d.title}: ${msg}`, `/news?id=${id}`).catch(() => {});
  }
}

async function queued() {
  return (await listNews()).filter((d) => d.post?.state === "queued").sort((a, b) => a.post!.requestedAt - b.post!.requestedAt);
}

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
    const x = (await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').innerText().catch(() => "")).includes(`@${X_HANDLE}`);
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
  if (cmd === "once") {
    if (!arg) throw new Error("usage: poster.ts once <draftId>");
    const ctx = await browser();
    try { await work(ctx, arg); } finally { await ctx.close(); }
    return;
  }
  if (cmd === "run") {
    log("poster: watching the queue");
    for (;;) {
      try {
        const q = await queued();
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
  console.log("commands: login | check | once <draftId> | dry <draftId> [igAt] | run");
}

main().then(() => { if (process.argv[2] !== "run") process.exit(0); }, (e) => { console.error(e); process.exit(1); });

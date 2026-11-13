// Screenshot of a public page for a proof slide: an article headline, an official release, or a post on X.
// npx tsx scripts/news/shot.ts <url> <out.png> [css selector] [--height 900] [--clip x,y,w,h]   (CSS px)
// For x.com/twitter.com status links it screenshots X's official embed (no login, no paid API).
import { chromium } from "playwright-core";

async function main() {
  const [url, out, selector] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--height" && all[i - 1] !== "--clip");
  const hi = process.argv.indexOf("--height");
  const height = hi > 0 ? Number(process.argv[hi + 1]) : 1000;
  if (!url || !out) throw new Error("usage: shot.ts <url> <out.png> [selector]");
  const tweet = url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/);
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: tweet ? 560 : 1200, height }, deviceScaleFactor: 2, locale: "en-US" });
  try {
    if (tweet) {
      await page.goto(`https://platform.twitter.com/embed/Tweet.html?id=${tweet[1]}&theme=light&dnt=true&hideThread=true`, { waitUntil: "networkidle" });
      const el = page.locator("article").first();
      await el.waitFor({ timeout: 15000 });
      await el.screenshot({ path: out });
    } else {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      // Cookie banners: decline / close when there's an obvious button. Never accept on the user's behalf.
      for (const label of [/reject/i, /decline/i, /necessary only/i, /^close$/i]) {
        const b = page.getByRole("button", { name: label }).first();
        if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
      }
      await page.waitForTimeout(800);
      const ci = process.argv.indexOf("--clip");
      const clip = ci > 0 ? process.argv[ci + 1].split(",").map(Number) : null;
      if (clip) await page.screenshot({ path: out, clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } });
      else if (selector) await page.locator(selector).first().screenshot({ path: out });
      else await page.screenshot({ path: out });
    }
    console.log(out);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

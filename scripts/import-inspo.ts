// Imports inspo-seed.md: the week-1 plan (slide text + references) and the archive of reference posts.
// Safe to re-run: existing items (by shortcode) and plan items (by group + number) are skipped.
// Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/import-inspo.ts inspo-seed.md
import { readFile } from "node:fs/promises";
import { createInspo, createPlan, listInspo, listPlans, listPosts, mutateInspo, mutateKv, mutatePost, mutatePlan } from "@/lib/server/store";
import { parseInstagramUrl } from "@/lib/igurl";
import type { Inspo, InspoNotes, Lang } from "@/lib/types";

const GROUP = "Week 1";
// Section heading → Instagram username and tag.
const ACCOUNTS: Record<string, { username: string; tag: string }> = {
  tradespad: { username: "tradespad", tag: "tradespad" },
  tradezella: { username: "tradezella", tag: "tradezella" },
  zcfxtrading: { username: "zcfxtrading", tag: "zcfxtrading" },
  manfxtrade: { username: "manfxtrade", tag: "manfxtrade" },
  "trading.motivation": { username: "_trading.motivation_", tag: "trading.motivation" },
  coinsauce: { username: "coinsauce", tag: "coinsauce" },
  thetradingclips: { username: "thetradingclips", tag: "thetradingclips" },
};
// Existing posts and the reference each was made from.
const EXISTING: { title: string; shortcode: string; plan?: number }[] = [
  { title: "S&P since 1921: you'd also be dead", shortcode: "Da6bEKyoUXE", plan: 0 },
  { title: "The iceberg: what others see", shortcode: "Dae29X2ISkr" },
  { title: "Risk:reward, 1:1 to 1:10", shortcode: "DZPn6kOMy-4" },
];

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isTableRow = (l: string) => l.trim().startsWith("|");
const isSep = (l: string) => /^\|\s*:?-{2,}/.test(l.trim());
const num = (s: string) => (/^[\d,.]+$/.test(s) ? Number(s.replace(/,/g, "")) : null);
const unescape = (s: string) => s.replace(/\\([_~*-])/g, "$1");
const linkOf = (s: string) => s.match(/\]\(([^)]+)\)/)?.[1] ?? null;

type Row = { shortcode: string; url: string; account: string; format: string; likes: number | null; comments: number | null; description: string };

async function main() {
  const md = await readFile(process.argv[2] || "inspo-seed.md", "utf8");
  const lines = md.split("\n");
  const at = (h: string) => lines.findIndex((l) => l.startsWith(h));

  // ---------- B. archive ----------
  const bStart = at("## B.");
  const accountStarts = lines.map((l, i) => [l, i] as const).filter(([l, i]) => i > bStart && /^### /.test(l) && !/How to read|What actually works/.test(l));
  const rows: Row[] = [];
  const accountNotes: InspoNotes["accounts"] = [];
  for (const [n, [heading, i]] of accountStarts.entries()) {
    const end = n + 1 < accountStarts.length ? accountStarts[n + 1][1] : lines.length;
    const key = heading.replace(/^### /, "").split(" — ")[0].replace(/\*/g, "").trim().toLowerCase();
    const acct = ACCOUNTS[key];
    if (!acct) throw new Error(`Unknown account section: ${heading}`);
    const body = lines.slice(i + 1, end);
    for (const l of body.filter((l) => isTableRow(l) && !isSep(l))) {
      const [post, format, likes, comments, what] = cells(l);
      const url = linkOf(post);
      if (!url || format === "—" || format === "Format") continue;
      const parsed = parseInstagramUrl(url);
      if (!parsed) continue;
      rows.push({ shortcode: parsed.shortcode, url: parsed.url, account: key, format, likes: num(likes), comments: num(comments), description: unescape(what) });
    }
    accountNotes.push({ tag: acct.tag, title: unescape(heading.replace(/^### /, "").replace(/\*/g, "")), text: body.filter((l) => !isTableRow(l)).join("\n").trim() });
  }
  const intro = lines.slice(at("### How to read this"), accountStarts[0][1]).join("\n").trim();

  // ---------- Inspo items ----------
  const existing = new Map((await listInspo()).map((x) => [x.shortcode, x] as const));
  let created = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.shortcode)) continue;
    seen.add(r.shortcode);
    if (existing.has(r.shortcode)) continue;
    const a = ACCOUNTS[r.account];
    const item = await createInspo({
      url: r.url, shortcode: r.shortcode, username: a.username, format: r.format, likes: r.likes, comments: r.comments,
      description: r.description, tags: [a.tag], status: "todo",
    });
    existing.set(r.shortcode, item);
    created++;
  }

  // ---------- A. week-1 plan ----------
  const aStart = at("## A."), aEnd = bStart;
  const planLines = lines.slice(aStart, aEnd);
  const mix = planLines.find((l) => l.startsWith("Mix:")) || "";
  const tables: string[][] = [];
  let cur: string[] = [];
  for (const l of planLines) {
    if (isTableRow(l)) cur.push(l);
    else if (cur.length) {
      tables.push(cur);
      cur = [];
    }
  }
  if (cur.length) tables.push(cur);
  const [ideasT, refsT] = tables;
  const ideas = ideasT.slice(2).map(cells).map(([n, type, en, it, es]) => ({ number: Number(n), type, texts: { en, it, es } as Record<Lang, string> }));
  const refs = refsT.slice(2).map(cells).map(([n, ref, , take]) => ({ number: Number(n), url: linkOf(ref)!, note: take }));

  const plans = await listPlans();
  let planCreated = 0;
  for (const idea of ideas) {
    if (plans.some((p) => p.group === GROUP && p.number === idea.number)) continue;
    const pr = refs.filter((r) => r.number === idea.number).map((r) => {
      const item = existing.get(parseInstagramUrl(r.url)!.shortcode);
      if (!item) throw new Error(`Reference not in archive: ${r.url}`);
      return { inspoId: item.id, note: r.note };
    });
    plans.push(await createPlan({ number: idea.number, group: GROUP, type: idea.type, texts: idea.texts, refs: pr, postId: null }));
    planCreated++;
  }

  // ---------- Notes ----------
  await mutateKv<InspoNotes>("inspoNotes", () => ({ intro: "", planIntro: "", accounts: [] }), (d) => {
    d.intro = intro;
    d.planIntro = mix;
    d.accounts = accountNotes;
  });

  // ---------- Link the posts that already exist ----------
  const posts = await listPosts();
  for (const e of EXISTING) {
    const post = posts.find((p) => p.title === e.title);
    const item = existing.get(e.shortcode) as Inspo | undefined;
    if (!post || !item) {
      console.warn(`could not link "${e.title}"`);
      continue;
    }
    await mutateInspo(item.id, (d) => {
      d.postId = post.id;
      d.status = "done";
    });
    await mutatePost(post.id, (p) => {
      p.inspoId = item.id;
    });
    if (e.plan !== undefined) {
      const plan = plans.find((p) => p.group === GROUP && p.number === e.plan);
      if (plan) await mutatePlan(plan.id, (d) => { d.postId = post.id; });
    }
  }

  console.log(`archive rows: ${rows.length}, unique posts: ${seen.size}, inspo created: ${created}, total inspo: ${existing.size}`);
  console.log(`plan items created: ${planCreated} (of ${ideas.length}), references: ${refs.length}`);
  console.log(`notes: intro ${intro.length} chars, ${accountNotes.length} accounts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

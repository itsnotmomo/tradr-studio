// End of a scheduling run (see SCHEDULING.md): marks the versions confirmed in Instagram's
// Scheduled content list as "Scheduled in Instagram" and sends the one summary ntfy message.
//
// Usage:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/schedule-finish.ts \
//     --plan .schedule/2026-10-09_2026-10-11/plan.json --confirmed .schedule/2026-10-09_2026-10-11/confirmed.txt [--label "Fri–Sun"] [--dry-run]
//
// confirmed.txt: one "<postId> <lang>" per line, only for items you SAW in Scheduled content
// with the right date and time. Anything not listed is left as it is.
import { readFile } from "node:fs/promises";
import { mutatePost } from "@/lib/server/store";
import { sendNtfy } from "@/lib/server/notify";
import { isLang, langInfo } from "@/lib/langs";
import type { Lang } from "@/lib/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

type PlanItem = { lang: Lang; postId: string; title: string; kind: "post" | "reel"; date: string; slot: string };

async function main() {
  const planPath = arg("plan"), confirmedPath = arg("confirmed");
  if (!planPath || !confirmedPath) throw new Error("Pass --plan and --confirmed");
  const dry = process.argv.includes("--dry-run");
  const plan = JSON.parse(await readFile(planPath, "utf8")) as { from: string; to: string; items: PlanItem[] };
  const lines = (await readFile(confirmedPath, "utf8")).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const confirmed = lines.map((l) => {
    const [postId, lang] = l.split(/\s+/);
    if (!isLang(lang)) throw new Error(`Bad line: ${l}`);
    const item = plan.items.find((x) => x.postId === postId && x.lang === lang);
    if (!item) throw new Error(`Not in the plan: ${l}`);
    return item;
  });

  for (const it of confirmed) {
    if (dry) {
      console.log(`would mark ${langInfo(it.lang).code} ${it.date} ${it.slot} “${it.title}”`);
      continue;
    }
    await mutatePost(it.postId, (p) => {
      const v = p.variants[it.lang];
      if (v.status === "posted") return; // never downgrade
      v.status = "scheduled";
      v.ready = true;
    });
    console.log(`marked ${langInfo(it.lang).code} ${it.date} ${it.slot} “${it.title}”`);
  }

  const n = (k: Lang) => confirmed.filter((x) => x.lang === k).length;
  // Every reel and every post needs its song added on the phone.
  const label = arg("label") || `${plan.from} → ${plan.to}`;
  const msg = `Scheduled ${label}: ${n("en")} EN · ${n("it")} IT · ${n("es")} ES. ${confirmed.length} posts need audio.`;
  console.log(msg);
  if (!dry) await sendNtfy("Instagram scheduled", msg, "/batch");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

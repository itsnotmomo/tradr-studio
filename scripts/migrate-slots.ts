// One-off: rewrites every post in the slot format (old posts had an HH:MM time) and
// re-resolves anything already scheduled to its slot's real time per account.
// Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/migrate-slots.ts
import { listPosts, mutatePost } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";
import { publishAt } from "@/lib/slots";
import { LK } from "@/lib/langs";

async function main() {
  const s = await getSettings();
  for (const p of await listPosts()) {
    const saved = await mutatePost(p.id, (x) => {
      for (const k of LK) {
        const v = x.variants[k];
        if (v.state === "scheduled" && !v.postNow && x.date) v.scheduledAt = publishAt(s, k, x.date, x.slot);
      }
    });
    console.log(`${saved.title}: ${saved.date ?? "idea"} ${saved.slot}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { route } from "@/lib/server/api";
import { getKv, listInspo, listPlans, listPosts } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";

export const GET = route(async () => {
  const [posts, inspo, plans, notes, settings] = await Promise.all([listPosts(), listInspo(), listPlans(), getKv("inspoNotes", () => ({})), getSettings()]);
  const json = JSON.stringify({ app: "tradr-studio", version: 2, exportedAt: new Date().toISOString(), settings, posts, inspo, plans, notes }, null, 1);
  return new Response(json, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="tradr-studio-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

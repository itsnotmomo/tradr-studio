import { route } from "@/lib/server/api";
import { getKv, getNewsDesk, listInspo, listNews, listPlans, listPosts, listSuggestions } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";

export const GET = route(async () => {
  const [posts, inspo, plans, notes, settings, news, newsSuggestions, newsDesk] = await Promise.all([listPosts(), listInspo(), listPlans(), getKv("inspoNotes", () => ({})), getSettings(), listNews(), listSuggestions(), getNewsDesk()]);
  const json = JSON.stringify({ app: "tradr-studio", version: 2, exportedAt: new Date().toISOString(), settings, posts, inspo, plans, notes, news, newsSuggestions, newsDesk }, null, 1);
  return new Response(json, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="tradr-studio-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

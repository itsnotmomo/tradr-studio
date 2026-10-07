import { route } from "@/lib/server/api";
import { listInspo, listPosts } from "@/lib/server/store";
import { getSettings } from "@/lib/server/settings";

export const GET = route(async () => {
  const [posts, inspo, settings] = await Promise.all([listPosts(), listInspo(), getSettings()]);
  const json = JSON.stringify({ app: "tape", version: 1, exportedAt: new Date().toISOString(), settings, posts, inspo }, null, 1);
  return new Response(json, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="tape-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

import { route } from "@/lib/server/api";
import { getNewsDesk, listNews, listSuggestions } from "@/lib/server/store";

// Everything the News section shows, in one read.
export const GET = route(async () => {
  const [drafts, suggestions, desk] = await Promise.all([listNews(), listSuggestions(), getNewsDesk()]);
  drafts.sort((a, b) => b.createdAt - a.createdAt);
  suggestions.sort((a, b) => b.createdAt - a.createdAt);
  return { drafts, suggestions, desk, now: Date.now() };
});

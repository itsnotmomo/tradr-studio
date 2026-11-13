import { body, route } from "@/lib/server/api";
import { createSuggestion, deleteSuggestion, UserError } from "@/lib/server/store";

// "Suggest a story": a link and/or a line. The next run turns it into a draft (or says why not).
export const POST = route(async (req) => {
  const b = await body<{ text?: string }>(req);
  const raw = String(b.text || "").trim().slice(0, 3000);
  if (!raw) throw new UserError("Paste a link or write a line.");
  const url = raw.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,;]+$/, "") ?? null;
  return { item: await createSuggestion(raw, url) };
});

export const DELETE = route(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new UserError("Missing id");
  await deleteSuggestion(id);
  return { ok: true };
});

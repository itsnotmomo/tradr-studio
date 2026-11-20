import { body, route } from "@/lib/server/api";
import { createSuggestion, deleteSuggestion, listSuggestions, mutateSuggestion, UserError } from "@/lib/server/store";

// "Suggest a story": a link and/or a line. The next run turns it into a draft (or says why not).
// { action: "make", id }: "Make this one" on a pitch from the news-scout run; it joins the queue like a suggestion.
export const POST = route(async (req) => {
  const b = await body<{ text?: string; action?: "make"; id?: string }>(req);
  if (b.action === "make") {
    if (!b.id) throw new UserError("Missing id");
    return {
      item: await mutateSuggestion(b.id, (s) => {
        if (s.status !== "pitch") throw new UserError("That pitch was already used.");
        s.status = "queued";
        s.pitch = "chosen";
        s.createdAt = Date.now(); // joins the back of the queue
      }),
    };
  }
  const raw = String(b.text || "").trim().slice(0, 3000);
  if (!raw) throw new UserError("Paste a link or write a line.");
  const url = raw.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,;]+$/, "") ?? null;
  return { item: await createSuggestion(raw, url) };
});

export const DELETE = route(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new UserError("Missing id");
  // A dismissed pitch is kept (hidden) so the news-scout run learns what you don't want.
  const pitch = (await listSuggestions()).find((s) => s.id === id && s.status === "pitch");
  if (pitch) {
    await mutateSuggestion(id, (s) => { s.status = "skipped"; s.pitch = "dismissed"; s.note = "Dismissed pitch"; });
    return { ok: true };
  }
  await deleteSuggestion(id);
  return { ok: true };
});

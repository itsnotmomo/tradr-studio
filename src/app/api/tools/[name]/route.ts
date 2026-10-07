import { body, route } from "@/lib/server/api";
import { redis } from "@/lib/server/redis";
import { UserError } from "@/lib/server/store";

// Tool settings (tweet card account details, fonts, texts) follow you between phone and desktop.
// "tweet-defaults" holds the tweet card's default images; only uploads and resets write it, so a
// device that loaded the tool earlier can never wipe them while saving other edits.
const NAMES = new Set(["tweet", "tweet-defaults", "editor"]);
type Ctx = { params: Promise<{ name: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { name } = await params;
  if (!NAMES.has(name)) throw new UserError("Unknown tool", 404);
  const raw = (await redis().get(`tool:${name}`)) as string | null;
  return raw ? JSON.parse(raw) : {};
});

export const PUT = route<Ctx>(async (req, { params }) => {
  const { name } = await params;
  if (!NAMES.has(name)) throw new UserError("Unknown tool", 404);
  const raw = JSON.stringify(await body(req));
  if (raw.length > 200_000) throw new UserError("Too large");
  await redis().set(`tool:${name}`, raw);
  return { ok: true };
});

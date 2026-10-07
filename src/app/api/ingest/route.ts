import { timingSafeEqual } from "node:crypto";
import { redis } from "@/lib/server/redis";

// Receives a read-only scan of public Instagram posts as a plain form POST (Instagram's page
// allows form submissions but no network calls to other sites). Guarded by INGEST_KEY; the raw
// scan is kept in Redis for scripts/import-scan.ts to process.
export async function POST(req: Request) {
  const want = process.env.INGEST_KEY || "";
  const form = await req.formData();
  const got = String(form.get("key") || "");
  if (want.length < 16 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new Response("Not allowed", { status: 401 });
  }
  const user = String(form.get("user") || "").replace(/[^a-z0-9._]/gi, "");
  const data = String(form.get("data") || "");
  let n = 0;
  try {
    n = (JSON.parse(data) as unknown[]).length;
  } catch {
    return new Response("Bad data", { status: 400 });
  }
  await redis().set(`ingest:scan:${user}`, data);
  return new Response(`<!doctype html><meta charset="utf-8"><title>Received</title><body style="font:16px system-ui;padding:40px">Received ${n} posts for @${user}. You can close this tab.</body>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

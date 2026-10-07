import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { checkScheduler } from "@/lib/server/watchdog";

// Called by GitHub Actions every 30 minutes and by Vercel Cron daily, with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const want = process.env.CRON_SECRET || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ok = want.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await checkScheduler());
}

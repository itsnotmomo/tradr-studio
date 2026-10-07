import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/server/scheduler";

export const maxDuration = 300;

// Called every minute by cron-job.org and daily by Vercel Cron, with
// "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const want = process.env.CRON_SECRET || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const ok = want.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out = await tick();
  return NextResponse.json({ ok: true, published: out.published.filter((x) => x.result !== "skipped"), recovered: out.recovered, metrics: out.metrics, daily: out.daily });
}

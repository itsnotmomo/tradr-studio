import { NextResponse } from "next/server";
import { login } from "@/lib/server/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const r = await login(String(email || ""), String(password || ""), ip);
  return NextResponse.json(r, { status: r.ok ? 200 : 401 });
}

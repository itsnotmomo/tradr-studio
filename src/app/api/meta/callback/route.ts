import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { route } from "@/lib/server/api";
import { codeToToken, connectWithUserToken } from "@/lib/server/meta/accounts";
import { describeGraphError } from "@/lib/server/meta/graph";
import { appOrigin } from "@/lib/server/origin";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const back = (q: Record<string, string>) => NextResponse.redirect(`${origin}/settings?${new URLSearchParams(q)}#accounts`);
  const jar = await cookies();
  const expected = jar.get("studio_oauth")?.value;
  jar.delete("studio_oauth");
  if (url.searchParams.get("error")) return back({ meta_error: url.searchParams.get("error_description") || "Facebook login was cancelled." });
  if (!expected || url.searchParams.get("state") !== expected) return back({ meta_error: "The login link expired. Try connecting again." });
  try {
    const token = await codeToToken(url.searchParams.get("code") || "", `${origin}/api/meta/callback`);
    const r = await connectWithUserToken(token);
    return back({ meta_ok: r.connected.join(",") });
  } catch (e) {
    return back({ meta_error: describeGraphError(e).message });
  }
});

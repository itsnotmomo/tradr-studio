import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { route } from "@/lib/server/api";
import { loginDialogUrl } from "@/lib/server/meta/accounts";
import { appOrigin } from "@/lib/server/origin";

// Starts "Connect with Facebook". One login covers all three Instagram accounts.
export const GET = route(async (req) => {
  const state = crypto.randomUUID();
  (await cookies()).set("studio_oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(loginDialogUrl(`${appOrigin(req)}/api/meta/callback`, state));
});

import { body, route } from "@/lib/server/api";
import { bumpSessionVersion, issueSession, setPassword, verifyPassword } from "@/lib/server/auth";
import { UserError } from "@/lib/server/store";

export const POST = route(async (req) => {
  const { current, next } = await body<{ current: string; next: string }>(req);
  if (!(await verifyPassword(String(current || "")))) throw new UserError("Your current password isn't right.");
  if (String(next || "").length < 12) throw new UserError("Use at least 12 characters.");
  await setPassword(next);
  await bumpSessionVersion(); // other devices sign in again with the new password
  await issueSession();
  return { ok: true };
});

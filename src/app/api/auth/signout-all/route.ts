import { route } from "@/lib/server/api";
import { bumpSessionVersion, logout } from "@/lib/server/auth";

export const POST = route(async () => {
  await bumpSessionVersion();
  await logout();
  return { ok: true };
});

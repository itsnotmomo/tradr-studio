import { route } from "@/lib/server/api";
import { sendNtfy } from "@/lib/server/notify";
import { UserError } from "@/lib/server/store";

export const POST = route(async () => {
  try {
    await sendNtfy("Tradr Studio", "Test notification. Tapping this opens Batch mode.", "/batch");
  } catch (e) {
    throw new UserError(`Couldn't send: ${(e as Error).message}`, 502);
  }
  return { ok: true };
});

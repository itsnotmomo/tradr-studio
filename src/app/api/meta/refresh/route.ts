import { route } from "@/lib/server/api";
import { snapshotFollowers } from "@/lib/server/scheduler";
import { getSettings } from "@/lib/server/settings";
import { utcToZoned } from "@/lib/time";

export const POST = route(async () => {
  const s = await getSettings();
  await snapshotFollowers(utcToZoned(Date.now(), s.timezone).date);
  return { ok: true };
});

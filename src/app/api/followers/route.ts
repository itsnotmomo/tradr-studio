import { route } from "@/lib/server/api";
import { redis } from "@/lib/server/redis";
import { LK } from "@/lib/langs";

export const GET = route(async () => {
  const p = redis().pipeline();
  for (const k of LK) p.hgetall(`followers:${k}`);
  const rows = (await p.exec()) as (Record<string, string> | null)[];
  return Object.fromEntries(LK.map((k, i) => [k, Object.fromEntries(Object.entries(rows[i] || {}).map(([d, n]) => [d, Number(n)]))]));
});

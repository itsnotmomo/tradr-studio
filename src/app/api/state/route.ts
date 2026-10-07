import { route } from "@/lib/server/api";
import { listPosts } from "@/lib/server/store";
import { getConnection, getSettings, publicAccounts } from "@/lib/server/settings";
import { schedulerHealth } from "@/lib/server/scheduler";

/** Everything the app shell needs, in one request. */
export const GET = route(async () => {
  const [posts, settings, conn, health] = await Promise.all([listPosts(), getSettings(), getConnection(), schedulerHealth()]);
  return {
    posts, settings, health, now: Date.now(),
    meta: {
      configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
      accounts: publicAccounts(conn), unmatched: conn.unmatched, userTokenExpiresAt: conn.userTokenExpiresAt, connectedAt: conn.connectedAt,
    },
  };
});

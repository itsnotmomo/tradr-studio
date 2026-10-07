import { body, route } from "@/lib/server/api";
import { connectWithUserToken } from "@/lib/server/meta/accounts";
import { describeGraphError } from "@/lib/server/meta/graph";
import { UserError } from "@/lib/server/store";

// Alternative to the login button: paste a system-user or Graph API Explorer token.
export const POST = route(async (req) => {
  const { token } = await body<{ token: string }>(req);
  if (!token || token.length < 20) throw new UserError("Paste the whole token.");
  try {
    const r = await connectWithUserToken(token);
    return { connected: r.connected, unmatched: r.unmatched };
  } catch (e) {
    throw new UserError(describeGraphError(e).message);
  }
});

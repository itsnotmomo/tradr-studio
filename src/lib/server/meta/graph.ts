import "server-only";

export const GRAPH_VERSION = "v26.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  type?: string;
  userTitle?: string;
  userMsg?: string;
  status: number;
  /** Worth retrying automatically (rate limits, Meta outages, network trouble). */
  transient: boolean;
  /** The token is no longer valid; the account needs reconnecting. */
  authProblem: boolean;
  constructor(message: string, init: Partial<GraphError> & { status: number }) {
    super(message);
    Object.assign(this, init);
    this.transient = init.transient ?? false;
    this.authProblem = init.authProblem ?? false;
    this.status = init.status;
  }
}

// https://developers.facebook.com/docs/graph-api/guides/error-handling
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613, 80001, 80002]);
const AUTH_CODES = new Set([102, 190, 200, 10]);

type Params = Record<string, string | number | boolean | undefined>;

export async function graph<T = Record<string, unknown>>(
  path: string, opts: { token?: string; method?: "GET" | "POST" | "DELETE"; params?: Params; timeoutMs?: number } = {},
): Promise<T> {
  const method = opts.method || "GET";
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams();
  const all: Params = { ...(opts.params || {}), ...(opts.token ? { access_token: opts.token } : {}) };
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined) continue;
    if (method === "GET") url.searchParams.set(k, String(v));
    else body.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method, body: method === "GET" ? undefined : body, cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (e) {
    throw new GraphError(`Couldn't reach Instagram (${(e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message})`, { status: 0, transient: true });
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON body */
  }
  const err = json.error as Record<string, unknown> | undefined;
  if (!res.ok || err) {
    const code = Number(err?.code ?? 0) || undefined;
    const subcode = Number(err?.error_subcode ?? 0) || undefined;
    const userMsg = (err?.error_user_msg as string) || undefined;
    const message = userMsg || (err?.message as string) || `Instagram returned HTTP ${res.status}`;
    throw new GraphError(message, {
      status: res.status, code, subcode, type: err?.type as string, userTitle: err?.error_user_title as string, userMsg,
      transient: res.status >= 500 || (code !== undefined && TRANSIENT_CODES.has(code)) || !!err?.is_transient,
      authProblem: code !== undefined && (AUTH_CODES.has(code) || (code >= 200 && code < 300)),
    });
  }
  return json as T;
}

export function describeGraphError(e: unknown) {
  if (e instanceof GraphError) {
    const bits = [e.code && `code ${e.code}`, e.subcode && `subcode ${e.subcode}`, e.type].filter(Boolean).join(", ");
    return { message: e.message, detail: bits || undefined, code: e.code ? String(e.code) : undefined };
  }
  return { message: (e as Error)?.message || String(e) };
}

import "server-only";
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function redis() {
  if (!client) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN are not set");
    // Values are stored as JSON strings we parse ourselves.
    client = new Redis({ url, token, automaticDeserialization: false });
  }
  return client;
}

/** HGETALL comes back as an object or a flat [field, value, …] list depending on the call path. */
export function hashToObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
}

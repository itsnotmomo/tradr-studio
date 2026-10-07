import "server-only";
import { getKv, mutateKv } from "./store";
import { LK } from "../langs";
import { DEFAULT_SCHEDULE } from "../slots";
import type { Account, AccountPublic, Lang, Settings } from "../types";

export const defaultSettings = (): Settings => ({
  timezone: "Europe/Rome",
  langs: Object.fromEntries(LK.map((k) => [k, { tradrSlide: null, tradr: "", hashtags: "" }])) as Settings["langs"],
  schedule: structuredClone(DEFAULT_SCHEDULE),
  notify: { weekly: true, slots: true, missed: true, weeklyTime: "09:00" },
});

/** Fills anything missing (older documents) with defaults. */
function complete<T extends Settings>(s: T): T {
  const d = defaultSettings();
  s.langs = Object.fromEntries(LK.map((k) => [k, { ...d.langs[k], ...(s.langs?.[k] || {}) }])) as Settings["langs"];
  s.schedule = Object.fromEntries(LK.map((k) => [k, { ...d.schedule[k], ...(s.schedule?.[k] || {}) }])) as Settings["schedule"];
  s.timezone ||= d.timezone;
  s.notify = { ...d.notify, ...(s.notify || {}) };
  delete (s as { defaultTime?: string }).defaultTime;
  return s;
}

export async function getSettings(): Promise<Settings & { rev: number }> {
  return complete(await getKv<Settings>("settings", defaultSettings));
}
export const mutateSettings = (fn: (s: Settings & { rev: number }) => void) =>
  mutateKv<Settings>("settings", defaultSettings, (s) => {
    complete(s);
    fn(s);
  });

// ---------- Connected Instagram accounts ----------

export type MetaConnection = {
  accounts: Partial<Record<Lang, Account>>;
  /** Long-lived Facebook user token the Page tokens came from. */
  userTokenEnc: string | null;
  userTokenExpiresAt: number | null;
  /** Instagram accounts the token can see that didn't match a language. */
  unmatched: { username: string; pageName: string }[];
  connectedAt: number | null;
};
const emptyConnection = (): MetaConnection => ({ accounts: {}, userTokenEnc: null, userTokenExpiresAt: null, unmatched: [], connectedAt: null });

export const getConnection = () => getKv<MetaConnection>("meta", emptyConnection);
export const mutateConnection = (fn: (c: MetaConnection & { rev: number }) => void) => mutateKv<MetaConnection>("meta", emptyConnection, fn);

export function publicAccounts(c: MetaConnection) {
  const out: Partial<Record<Lang, AccountPublic>> = {};
  for (const k of LK) {
    const a = c.accounts[k];
    if (a) {
      const { tokenEnc: _t, ...rest } = a;
      void _t;
      out[k] = rest;
    }
  }
  return out;
}

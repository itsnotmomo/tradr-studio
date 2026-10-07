import "server-only";
import { getKv, mutateKv } from "./store";
import { LK } from "../langs";
import type { Account, AccountPublic, Lang, Settings } from "../types";

export const defaultSettings = (): Settings => ({
  timezone: "Europe/Rome",
  defaultTime: "18:00",
  langs: Object.fromEntries(LK.map((k) => [k, { tradrSlide: null, tradr: "", hashtags: "" }])) as Settings["langs"],
});

export async function getSettings(): Promise<Settings & { rev: number }> {
  const s = await getKv<Settings>("settings", defaultSettings);
  const d = defaultSettings();
  return { ...d, ...s, langs: Object.fromEntries(LK.map((k) => [k, { ...d.langs[k], ...(s.langs?.[k] || {}) }])) as Settings["langs"] };
}
export const mutateSettings = (fn: (s: Settings & { rev: number }) => void) =>
  mutateKv<Settings>("settings", defaultSettings, (s) => {
    const d = defaultSettings();
    s.langs = Object.fromEntries(LK.map((k) => [k, { ...d.langs[k], ...(s.langs?.[k] || {}) }])) as Settings["langs"];
    fn(s);
  });

// ---------- Connected Instagram accounts ----------

export type MetaConnection = {
  accounts: Partial<Record<Lang, Account>>;
  /** Long-lived Facebook user token (for Business Discovery). */
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

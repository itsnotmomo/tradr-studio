import type { Lang } from "./types";

export const LANGS: { k: Lang; code: string; name: string; handle: string }[] = [
  { k: "en", code: "EN", name: "English", handle: "@tradr__app" },
];
export const LK: Lang[] = LANGS.map((l) => l.k);
export const langInfo = (k: Lang) => LANGS.find((l) => l.k === k)!;
export const isLang = (v: unknown): v is Lang => v === "en";

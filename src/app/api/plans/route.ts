import { route } from "@/lib/server/api";
import { getKv, listPlans } from "@/lib/server/store";
import type { InspoNotes } from "@/lib/types";

export const GET = route(async () => {
  const [plans, notes] = await Promise.all([listPlans(), getKv<InspoNotes>("inspoNotes", () => ({ intro: "", planIntro: "", accounts: [] }))]);
  return { plans: plans.sort((a, b) => a.group.localeCompare(b.group) || a.number - b.number), notes };
});

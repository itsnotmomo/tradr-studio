import { redirect } from "next/navigation";

// News became the Instagram and X screens (20 Nov 2026). Old links (ntfy pushes, ?id=, ?tab=style) still land right.
export default async function NewsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  if (q.tab === "style") redirect("/style");
  if (q.id) redirect(`/instagram?id=${encodeURIComponent(q.id)}`);
  redirect("/instagram");
}

import { redirect } from "next/navigation";

// Tradr Media opens on Instagram (20 Nov 2026). The Planner is archived at /planner.
export default function Home() {
  redirect("/instagram");
}

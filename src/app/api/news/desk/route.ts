import { body, route } from "@/lib/server/api";
import { mutateNewsDesk, uid, UserError } from "@/lib/server/store";

type B =
  | { action: "addRefs"; images: { url: string; w: number; h: number }[]; note?: string }
  | { action: "removeRef"; id: string }
  | { action: "noteRef"; id: string; note: string }
  | { action: "chooseEnd"; id: string };

export const POST = route(async (req) => {
  const b = await body<B>(req);
  return mutateNewsDesk((d) => {
    if (b.action === "addRefs") {
      const imgs = (b.images || []).filter((i) => /\.public\.blob\.vercel-storage\.com\//.test(i.url));
      if (!imgs.length) throw new UserError("Add a screenshot.");
      for (const i of imgs) d.refs.unshift({ id: uid(), url: i.url, w: i.w, h: i.h, note: String(b.note || "").slice(0, 1000), addedAt: Date.now() });
    } else if (b.action === "removeRef") {
      d.refs = d.refs.filter((r) => r.id !== b.id);
    } else if (b.action === "noteRef") {
      const r = d.refs.find((x) => x.id === b.id);
      if (r) r.note = String(b.note || "").slice(0, 1000);
    } else if (b.action === "chooseEnd") {
      if (!d.endOptions.some((o) => o.id === b.id)) throw new UserError("Unknown option");
      d.endChoice = b.id;
    } else throw new UserError("Unknown action");
  });
});

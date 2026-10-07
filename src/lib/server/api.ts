import "server-only";
import { NextResponse } from "next/server";
import { requireSession } from "./auth";
import { ConflictError, NotFoundError, UserError } from "./store";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Auth check + consistent JSON errors for every private API route. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    if (!(await requireSession())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof NotFoundError) return NextResponse.json({ error: "Not found. It may have been deleted." }, { status: 404 });
      if (e instanceof ConflictError) return NextResponse.json({ error: "Something else changed this at the same moment. Try again." }, { status: 409 });
      console.error(e);
      return NextResponse.json({ error: (e as Error).message || "Something went wrong" }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new UserError("Invalid request body");
  }
}

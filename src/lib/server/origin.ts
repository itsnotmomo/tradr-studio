import "server-only";

export const appOrigin = (req: Request) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

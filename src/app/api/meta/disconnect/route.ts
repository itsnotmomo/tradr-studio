import { body, route } from "@/lib/server/api";
import { mutateConnection } from "@/lib/server/settings";
import { isLang, LK } from "@/lib/langs";

export const POST = route(async (req) => {
  const { lang } = await body<{ lang?: string }>(req);
  await mutateConnection((c) => {
    if (lang && isLang(lang)) delete c.accounts[lang];
    else {
      c.accounts = {};
      c.userTokenEnc = null;
      c.userTokenExpiresAt = null;
    }
    if (!LK.some((k) => c.accounts[k])) c.userTokenEnc = null;
  });
  return { ok: true };
});

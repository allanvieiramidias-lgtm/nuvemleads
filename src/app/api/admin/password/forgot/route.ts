import { z } from "zod";
import { db } from "@/db";
import { appUrl, clientIp, forbiddenOrigin, isSameOrigin, json } from "@/lib/http";
import { requestPasswordReset } from "@/server/admin-auth";

const Body = z.object({ email: z.string().max(200) });

/** Sempre 200 com a mesma resposta: não revela se o e-mail existe (ARQUITETURA §5). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (parsed.success) {
      await requestPasswordReset(db, {
        email: parsed.data.email,
        ip: clientIp(req),
        appUrl: appUrl(req),
      });
    }
  } catch (err) {
    // falha de e-mail não muda a resposta; fica no log do servidor
    console.error("Falha ao processar 'Esqueci minha senha':", err);
  }
  return json({ ok: true });
}

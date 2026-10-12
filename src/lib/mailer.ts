import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Produção: SMTP da Hostinger (porta 465, SSL). Desenvolvimento/testes sem SMTP_PASS:
 * grava cada e-mail como JSON em MAIL_OUTBOX (padrão .data/outbox) — nada sai da máquina.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (SMTP_HOST && SMTP_PASS) {
    const port = Number(SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({ from: SMTP_FROM ?? SMTP_USER, ...mail });
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SMTP não configurado (SMTP_HOST/SMTP_PASS)");
  }

  const dir = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.MAIL_OUTBOX ?? ".data/outbox",
  );
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`);
  await writeFile(file, JSON.stringify({ ...mail, sentAt: new Date().toISOString() }, null, 2));
  console.log(`[e-mail de desenvolvimento] ${mail.subject} → ${mail.to} (${file})`);
}

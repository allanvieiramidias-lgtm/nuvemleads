import { pool } from "@/db";
import { json } from "@/lib/http";

/**
 * Monitor de disponibilidade (HOSPEDAGEM §8): 200 quando o app e o banco respondem, 503 se o
 * banco cair. Sem nenhum dado (nem versão, nem contagens).
 */
export async function GET() {
  try {
    await Promise.race([
      pool.query("select 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}

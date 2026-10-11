// Seed: Settings padrão agora; admin e dados de demonstração na Etapa 2.
import "dotenv/config";
import { db, pool } from "../src/db";
import { settings } from "../src/db/schema";

await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
await pool.end();
console.log("Seed concluído.");

// Aplica as migrações de ./drizzle. Usado no dev (npm run db:migrate) e na imagem de produção (dist/migrate.js).
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle(pool), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
await pool.end();
console.log("Migrações aplicadas.");

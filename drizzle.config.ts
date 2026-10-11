import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrações SQL geradas a partir de src/db/schema.ts (ARQUITETURA §3)
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});

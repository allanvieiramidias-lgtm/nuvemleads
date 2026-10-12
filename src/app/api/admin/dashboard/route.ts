import { db } from "@/db";
import { adminRoute } from "@/lib/admin-api";
import { json } from "@/lib/http";
import { getDashboard } from "@/server/dashboard";

export const GET = adminRoute(async () => json(await getDashboard(db)));

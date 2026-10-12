import { z } from "zod";
import { db } from "@/db";
import { adminRoute, userDto } from "@/lib/admin-api";
import { json, readJson } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { isAvatarKey } from "@/server/avatars";
import { createUser, getActiveUsers, listUsers } from "@/server/users";

export const GET = adminRoute(async () => json({ users: (await listUsers(db)).map(userDto) }));

const Body = z.object({
  name: z.string().max(200),
  pin: z.string().max(20),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  tone: z.enum(["ACCENT", "NEUTRAL"]).optional(),
  avatarKey: z.string().refine(isAvatarKey).nullable().optional(),
});

export const POST = adminRoute(async (req, { admin }) => {
  const body = await readJson(req, Body);
  // Tom do avatar: o contrário do da outra pessoa ativa, para as duas se distinguirem.
  const tone =
    body.tone ??
    ((await getActiveUsers(db)).some((u) => u.tone === "ACCENT") ? "NEUTRAL" : "ACCENT");
  const user = await createUser(db, { ...body, tone });
  await logAdminEvent(db, admin.id, "USER_CREATED", user.id);
  return json({ user: userDto(user) }, { status: 201 });
});

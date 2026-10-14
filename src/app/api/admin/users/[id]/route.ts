import { z } from "zod";
import { db } from "@/db";
import { adminRoute, isUuid, userDto } from "@/lib/admin-api";
import { apiError, json, readJson } from "@/lib/http";
import { logAdminEvent } from "@/server/audit";
import { deleteAvatar, isAvatarKey } from "@/server/avatars";
import { DomainError } from "@/server/errors";
import { assertUsernameFree, getUser, setUserStatus, updateUserProfile } from "@/server/users";
import { userNameSchema, usernameSchema } from "@/lib/validators";

type P = { id: string };

export const GET = adminRoute<P>(async (_req, { params }) => {
  const user = isUuid(params.id) ? await getUser(db, params.id) : null;
  return user ? json({ user: userDto(user) }) : apiError("NOT_FOUND", "Usuário não encontrado.");
});

const Body = z.object({
  name: z.string().max(200).optional(),
  username: z.string().max(60).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  avatarKey: z.string().refine(isAvatarKey).nullable().optional(),
});

export const PATCH = adminRoute<P>(async (req, { admin, params }) => {
  if (!isUuid(params.id)) return apiError("NOT_FOUND", "Usuário não encontrado.");
  const body = await readJson(req, Body);
  const before = await getUser(db, params.id);
  if (!before) return apiError("NOT_FOUND", "Usuário não encontrado.");

  // Valida o nome antes de mudar qualquer coisa, para não salvar pela metade.
  if (body.name !== undefined) {
    const r = userNameSchema.safeParse(body.name);
    if (!r.success)
      throw new DomainError("VALIDATION", r.error.issues[0]!.message, {
        name: r.error.issues[0]!.message,
      });
  }

  if (body.username !== undefined) {
    const r = usernameSchema.safeParse(body.username);
    if (!r.success)
      throw new DomainError("VALIDATION", r.error.issues[0]!.message, {
        username: r.error.issues[0]!.message,
      });
    await assertUsernameFree(db, r.data, params.id);
  }

  let user = before;
  // Status primeiro: se a sala estiver cheia, nada mais é alterado.
  if (body.status && body.status !== before.status) {
    user = await setUserStatus(db, params.id, body.status);
    await logAdminEvent(
      db,
      admin.id,
      body.status === "ACTIVE" ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      params.id,
    );
  }
  if (body.name !== undefined || body.username !== undefined || body.avatarKey !== undefined) {
    user = await updateUserProfile(db, params.id, {
      name: body.name,
      username: body.username,
      avatarKey: body.avatarKey,
    });
    if (body.avatarKey !== undefined && before.avatarKey && before.avatarKey !== body.avatarKey) {
      await deleteAvatar(before.avatarKey);
    }
    await logAdminEvent(db, admin.id, "USER_UPDATED", params.id);
  }
  return json({ user: userDto(user) });
});

import { z } from "zod";
import { MEDIA_KINDS, type MediaKind } from "@/server/media-lifecycle";

/** Limpeza manual: "antes de" um dia (AAAA-MM-DD, horário de Brasília) e os tipos escolhidos. */
export const PurgeBody = z.object({
  before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data."),
  kinds: z
    .array(z.enum(MEDIA_KINDS as [MediaKind, ...MediaKind[]]))
    .min(1, "Escolha ao menos um tipo."),
});

export function purgeInput(body: z.infer<typeof PurgeBody>) {
  const before = new Date(`${body.before}T00:00:00-03:00`);
  return { before, kinds: [...new Set(body.kinds)] };
}

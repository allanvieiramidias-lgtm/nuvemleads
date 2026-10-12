import { readAvatar } from "@/server/avatars";

/** Foto de perfil. O id é aleatório (uuid) e muda a cada troca de foto. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = /^[0-9a-f-]{36}$/.test(id) ? await readAvatar(`avatars/${id}.webp`) : null;
  if (!bytes)
    return new Response("Não encontrado", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

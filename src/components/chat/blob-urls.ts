"use client";

/**
 * Endereços blob: criados para prévias (foto, vídeo, áudio antes de enviar).
 * Todos são revogados ao bloquear/sair, para nada da conversa ficar na memória (README §4.4).
 */
const urls = new Set<string>();

export function createBlobUrl(blob: Blob): string {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}

export function revokeBlobUrl(u: string | null | undefined) {
  if (u && urls.delete(u)) URL.revokeObjectURL(u);
}

export function revokeAllBlobUrls() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
}

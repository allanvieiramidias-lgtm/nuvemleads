import { z } from "zod";

// Textos do README §4.9 — usados igual no cliente e no servidor.
export const MSG = {
  nameRequired: "Informe o nome da pessoa.",
  pinFormat: "O PIN deve ter exatamente 6 números.",
  pinWeak: "Escolha um PIN menos previsível.",
  pinMismatch: "Os PINs não coincidem.",
  roomFull: "A sala já tem duas pessoas ativas.",
  roomFullForm: "A sala já tem duas pessoas ativas. Desative alguém ou salve como Inativo.",
  passwordShort: "A senha deve ter pelo menos 10 caracteres.",
  usernameFormat: "Use de 3 a 24 letras sem acento, números, ponto, hífen ou sublinhado.",
  usernameTaken: "Este usuário já está em uso.",
} as const;

const WEAK_PINS = new Set(["123456", "654321", "012345"]);

/** PIN fraco: 6 dígitos iguais, 123456, 654321 ou 012345 (README §4.9). */
export function isWeakPin(pin: string): boolean {
  return /^(\d)\1{5}$/.test(pin) || WEAK_PINS.has(pin);
}

export const pinSchema = z
  .string()
  .regex(/^\d{6}$/, MSG.pinFormat)
  .refine((p) => !isWeakPin(p), MSG.pinWeak);

/** Para conferir um PIN digitado (login): só formato, nunca "fraco". */
export const pinAttemptSchema = z.string().regex(/^\d{6}$/);

export const userNameSchema = z.string().trim().min(2, MSG.nameRequired).max(60);

export const passwordSchema = z.string().min(10, MSG.passwordShort).max(200);

export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

/** Usuário para entrar pela página principal (DECISOES §29): minúsculo, sem acento. */
export const normalizeUsername = (v: string) => v.trim().toLowerCase();
export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;
export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(z.string().regex(USERNAME_RE, MSG.usernameFormat));

/** Sugestão a partir do nome: primeiro nome, sem acento, minúsculo ("Maria Clara" → "maria"). */
export function suggestUsername(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);
}

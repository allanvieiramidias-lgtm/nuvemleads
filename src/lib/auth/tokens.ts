import { createHash, randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

/** Token opaco do cookie (256 bits). Só o sha256 vai para o banco. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Link pessoal /u/<slug>: 12 caracteres sem os que se confundem (0/o, 1/i/l) ≈ 59 bits.
// O link sozinho não dá acesso: sempre exige o PIN.
const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const newSlug = customAlphabet(SLUG_ALPHABET, 12);

import { hash, verify } from "@node-rs/argon2";

// argon2id, memoryCost 19 MiB, timeCost 2 (ARQUITETURA §7). Usado para senha e PIN.
const OPTIONS = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

/** Nunca lança: hash corrompido ou vazio conta como "não confere". */
export async function verifySecret(hashed: string, secret: string): Promise<boolean> {
  try {
    return await verify(hashed, secret);
  } catch {
    return false;
  }
}

/**
 * Hash válido de um segredo aleatório, para comparar quando o usuário/e-mail não existe —
 * assim a resposta leva o mesmo tempo e não revela se a conta existe.
 */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashSecret(crypto.randomUUID());
  return dummy;
}

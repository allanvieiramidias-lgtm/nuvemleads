import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { DomainError, type ErrorCode } from "@/server/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  INVALID_PIN: 401,
  FORBIDDEN: 401,
  REVOKED: 401,
  NOT_FOUND: 404,
  ROOM_FULL: 409,
  LOCKED: 423,
  TOO_MANY: 429,
};

/** Toda resposta JSON da API: `Cache-Control: no-store` (ARQUITETURA §5). */
export function json<T>(body: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { ...NO_STORE, ...init?.headers },
  });
}

export function apiError(code: ErrorCode, message: string, fields?: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (code === "TOO_MANY" && fields?.retryAfter) headers["Retry-After"] = fields.retryAfter;
  return json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status: STATUS[code], headers },
  );
}

/** Converte erros conhecidos em resposta; o resto vira 500 sem detalhes. */
export function handleError(err: unknown) {
  if (err instanceof DomainError) return apiError(err.code, err.message, err.fields);
  if (err instanceof ZodError)
    return apiError("VALIDATION", err.issues[0]?.message ?? "Dados inválidos.");
  console.error(err);
  return json(
    { error: { code: "INTERNAL", message: "Algo deu errado. Tente de novo." } },
    { status: 500 },
  );
}

/** Lê e valida o corpo JSON com zod. */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new DomainError("VALIDATION", "Dados inválidos.");
  }
  return schema.parse(body);
}

/**
 * CSRF: mutações só aceitas com `Origin` igual ao próprio site (ARQUITETURA §7).
 * Compara com o Host recebido (o Caddy repassa o original) e com APP_URL.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  const reqHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (reqHost) allowed.add(reqHost);
  if (process.env.APP_URL) {
    try {
      allowed.add(new URL(process.env.APP_URL).host);
    } catch {
      /* APP_URL inválida: ignora */
    }
  }
  return allowed.has(host);
}

export function forbiddenOrigin() {
  return apiError("FORBIDDEN", "Origem não permitida.");
}

/** IP do cliente: primeiro valor de X-Forwarded-For (definido pelo Caddy), senão "local". */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  return ip || "local";
}

/** URL pública do app para links de e-mail. */
export function appUrl(req: Request): string {
  return process.env.APP_URL ?? new URL(req.url).origin;
}

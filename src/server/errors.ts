/** Erro de regra de negócio com código da API (ARQUITETURA §5) e texto do README. */
export type ErrorCode =
  | "VALIDATION"
  | "INVALID_PIN"
  | "TOO_MANY"
  | "LOCKED"
  | "REVOKED"
  | "ROOM_FULL"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "GONE";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

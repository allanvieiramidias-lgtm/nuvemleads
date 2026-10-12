/** Cliente mínimo para a API (mesma origem, JSON). Lança ApiError com código e mensagem do servidor. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, body?: unknown, method = "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Sem conexão. Verifique a internet e tente de novo.");
  }
  const data = (await res.json().catch(() => null)) as
    (T & { error?: { code: string; message: string; fields?: Record<string, string> } }) | null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "INTERNAL",
      e?.message ?? "Algo deu errado. Tente de novo.",
      e?.fields,
    );
  }
  return data as T;
}

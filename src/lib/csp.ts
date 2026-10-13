/**
 * Content-Security-Policy com nonce por requisição (DECISOES §14, ARQUITETURA §7).
 * Só scripts com o nonce desta resposta rodam; o 'strict-dynamic' deixa que eles carreguem
 * os pedaços do próprio Next. Sem nenhuma origem externa.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; appUrl?: string }): string {
  const connect = ["'self'"];
  if (opts.appUrl) {
    try {
      const u = new URL(opts.appUrl);
      // o Safari antigo não trata ws/wss como 'self'
      connect.push(`${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`);
    } catch {
      /* APP_URL inválida: fica só 'self' */
    }
  }
  if (opts.dev) connect.push("ws:"); // recarga automática do modo de desenvolvimento

  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (opts.dev) script.push("'unsafe-eval'"); // o React usa eval só em desenvolvimento

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": ["'self'", "'unsafe-inline'"], // estilos embutidos do Radix e do Next
    "img-src": ["'self'", "blob:", "data:"],
    "media-src": ["'self'", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "worker-src": ["'none'"], // nada de service worker (CLAUDE.md)
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  // Sem upgrade-insecure-requests: o HSTS do Caddy já força HTTPS, e a diretiva quebraria
  // o teste de produção em http://localhost.
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** 128 bits aleatórios em base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

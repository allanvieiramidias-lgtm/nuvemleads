import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/csp";

const isProd = process.env.NODE_ENV === "production";
const ADMIN_COOKIE = isProd ? "__Host-nl_admin" : "nl_admin";
const USER_COOKIE = isProd ? "__Host-nl_user" : "nl_user";
const ADMIN_SESSION_SECONDS = 8 * 3600;

// Telas do admin abertas sem sessão
const PUBLIC_ADMIN = ["/admin/login", "/admin/esqueci-senha", "/admin/redefinir-senha"];

/**
 * Next 16 (antigo middleware). Faz duas coisas:
 * 1) CSP com nonce em toda página (DECISOES §14). O Next lê o nonce do cabeçalho da
 *    requisição e o coloca nos próprios scripts.
 * 2) Confere se há cookie e renova o prazo dele; a validação de verdade (banco) fica nos
 *    layouts e nas rotas.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Conversa sem cookie de participante → tela de acesso
  if (
    (pathname === "/chat" || pathname.startsWith("/chat/")) &&
    !req.cookies.get(USER_COOKIE)?.value
  )
    return redirectTo(req, "/");

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (isAdmin) {
    const isPublic = PUBLIC_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic && !token) return redirectTo(req, "/admin/login");
  }

  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: !isProd, appUrl: process.env.APP_URL });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  // Renovação deslizante do cookie (8 h desde a última visita)
  if (isAdmin && token) {
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_SECONDS,
    });
  }
  return res;
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    {
      // Páginas: tudo menos API (respostas JSON e mídia têm cabeçalhos próprios) e arquivos fixos.
      source:
        "/((?!api/|_next/static|_next/image|icon\\.svg|apple-icon\\.png|icon-192\\.png|icon-512\\.png|manifest\\.webmanifest).*)",
    },
  ],
};

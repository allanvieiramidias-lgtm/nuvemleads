import { NextResponse, type NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";
const ADMIN_COOKIE = isProd ? "__Host-nl_admin" : "nl_admin";
const USER_COOKIE = isProd ? "__Host-nl_user" : "nl_user";
const ADMIN_SESSION_SECONDS = 8 * 3600;

// Telas do admin abertas sem sessão
const PUBLIC_ADMIN = ["/admin/login", "/admin/esqueci-senha", "/admin/redefinir-senha"];

/**
 * Next 16 (antigo middleware). Só confere se há cookie e renova o prazo dele;
 * a validação de verdade (banco) fica nos layouts e nas rotas (DECISOES §14).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Conversa sem cookie de participante → tela de acesso
  if (pathname === "/chat" || pathname.startsWith("/chat/")) {
    if (req.cookies.get(USER_COOKIE)?.value) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const isPublic = PUBLIC_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  // Renovação deslizante do cookie (8 h desde a última visita)
  if (token) {
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

export const config = { matcher: ["/admin/:path*", "/chat", "/chat/:path*"] };

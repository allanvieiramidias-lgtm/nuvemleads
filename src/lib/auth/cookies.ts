const isProd = process.env.NODE_ENV === "production";

// `__Host-` exige Secure; em http://localhost (dev/testes) usamos o nome sem prefixo (DECISOES §14).
export const USER_COOKIE = isProd ? "__Host-nl_user" : "nl_user";
export const ADMIN_COOKIE = isProd ? "__Host-nl_admin" : "nl_admin";
/** Último link pessoal usado (só o slug), para quem perdeu o link — DECISOES §13. */
export const LAST_SLUG_COOKIE = "nl_last";
/** Aparelho lembrado (DECISOES §29): token opaco, 180 dias desde o último PIN certo. */
export const DEVICE_COOKIE = isProd ? "__Host-nl_device" : "nl_device";
export const DEVICE_DAYS = 180;

export const USER_SESSION_HOURS = 12;
export const ADMIN_SESSION_HOURS = 8;

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict";
  path: "/";
  maxAge?: number;
};

export function sessionCookieOptions(maxAgeSeconds: number): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: "strict", path: "/", maxAge: maxAgeSeconds };
}

export function lastSlugCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: "strict", path: "/", maxAge: 180 * 24 * 3600 };
}

export function deviceCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: DEVICE_DAYS * 24 * 3600,
  };
}

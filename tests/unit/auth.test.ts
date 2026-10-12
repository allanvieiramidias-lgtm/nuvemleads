import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "@/lib/auth/hash";
import { hashToken, newSessionToken, newSlug } from "@/lib/auth/tokens";
import { resolveKey, storageKeyFor } from "@/lib/storage";

describe("hash argon2id", () => {
  it("gera argon2id com 19 MiB e 2 iterações, e confere", async () => {
    const h = await hashSecret("246810");
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(h).not.toContain("246810");
    expect(await verifySecret(h, "246810")).toBe(true);
    expect(await verifySecret(h, "246811")).toBe(false);
  });

  it("hash inválido conta como não confere, sem lançar", async () => {
    expect(await verifySecret("lixo", "246810")).toBe(false);
  });
});

describe("tokens", () => {
  it("token de sessão é aleatório e só o sha256 vai para o banco", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("slug tem 12 caracteres sem letras ambíguas", () => {
    for (let i = 0; i < 200; i++) expect(newSlug()).toMatch(/^[2-9a-hj-km-np-z]{12}$/);
  });
});

describe("storage", () => {
  it("monta AAAA/MM/<id>.<ext>", () => {
    expect(storageKeyFor("abc", "JPG", new Date("2026-03-05T12:00:00Z"))).toBe("2026/03/abc.jpg");
  });
  it("recusa caminhos que saem da pasta de uploads", () => {
    expect(() => resolveKey("../../etc/passwd")).toThrow();
    expect(() => resolveKey("2026/03/abc.jpg")).not.toThrow();
  });
});

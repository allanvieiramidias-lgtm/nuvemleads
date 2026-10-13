import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "@/lib/csp";

const parse = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [k, ...v] = d.split(" ");
      return [k!, v];
    }),
  );

describe("CSP (DECISOES §14)", () => {
  it("produção: nonce, strict-dynamic, sem eval, sem origens externas", () => {
    const p = parse(buildCsp("abc123", { dev: false, appUrl: "https://chat.exemplo.com.br" }));
    expect(p["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(p["connect-src"]).toEqual(["'self'", "wss://chat.exemplo.com.br"]);
    expect(p["frame-ancestors"]).toEqual(["'none'"]);
    expect(p["object-src"]).toEqual(["'none'"]);
    expect(p["base-uri"]).toEqual(["'self'"]);
    expect(p["form-action"]).toEqual(["'self'"]);
    expect(p["img-src"]).toEqual(["'self'", "blob:", "data:"]);
    expect(p["media-src"]).toEqual(["'self'", "blob:"]);
    expect(p["worker-src"]).toEqual(["'none'"]);
    const all = Object.values(p).flat().join(" ");
    expect(all).not.toContain("unsafe-eval");
    expect(all).not.toMatch(/https?:\/\//);
  });

  it("desenvolvimento: libera eval e a recarga automática", () => {
    const p = parse(buildCsp("n", { dev: true, appUrl: "http://localhost:3000" }));
    expect(p["script-src"]).toContain("'unsafe-eval'");
    expect(p["connect-src"]).toEqual(["'self'", "ws://localhost:3000", "ws:"]);
  });

  it("nonce novo a cada chamada, 128 bits", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(atob(a)).toHaveLength(16);
  });
});

import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
  it("usa primeiro e último nome", () => {
    expect(initials("Maria Clara")).toBe("MC");
    expect(initials("Allan Vieira Souza")).toBe("AS");
  });
  it("nome único usa duas letras", () => {
    expect(initials("Renata")).toBe("RE");
  });
  it("ignora espaços extras e vazio", () => {
    expect(initials("  ana   lima ")).toBe("AL");
    expect(initials("   ")).toBe("");
  });
});

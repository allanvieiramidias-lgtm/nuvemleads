import { describe, expect, it } from "vitest";
import { isWeakPin, MSG, pinAttemptSchema, pinSchema, userNameSchema } from "@/lib/validators";

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe("PIN (README §4.9)", () => {
  it("aceita 6 números não previsíveis", () => {
    expect(pinSchema.safeParse("246810").success).toBe(true);
    expect(pinSchema.safeParse("905317").success).toBe(true);
  });

  it.each(["12345", "1234567", "12a456", " 24681", ""])("recusa formato inválido %j", (pin) => {
    expect(firstError(pinSchema.safeParse(pin))).toBe(MSG.pinFormat);
  });

  it.each(["000000", "111111", "999999", "123456", "654321", "012345"])(
    "recusa PIN fraco %s",
    (pin) => {
      expect(isWeakPin(pin)).toBe(true);
      expect(firstError(pinSchema.safeParse(pin))).toBe(MSG.pinWeak);
    },
  );

  it("não considera fraco um PIN só parecido", () => {
    expect(isWeakPin("123457")).toBe(false);
    expect(isWeakPin("111112")).toBe(false);
  });

  it("tentativa de login só confere o formato (um PIN fraco antigo ainda pode ser digitado)", () => {
    expect(pinAttemptSchema.safeParse("123456").success).toBe(true);
    expect(pinAttemptSchema.safeParse("12345").success).toBe(false);
  });
});

describe("nome", () => {
  it("exige pelo menos 2 caracteres depois de tirar espaços", () => {
    expect(firstError(userNameSchema.safeParse(" A "))).toBe(MSG.nameRequired);
    expect(userNameSchema.parse("  Maria Clara ")).toBe("Maria Clara");
  });
});

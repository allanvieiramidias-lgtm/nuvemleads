export type UserStatus = "ACTIVE" | "INACTIVE";
export const STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: "Ativo", INACTIVE: "Inativo" };
export const STATUS_OPTIONS = [
  { value: "ACTIVE" as const, label: "Ativo" },
  { value: "INACTIVE" as const, label: "Inativo" },
];
export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

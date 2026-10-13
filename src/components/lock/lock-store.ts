"use client";

import { create } from "zustand";

export type LockReason = "TAB" | "BLUR" | "IDLE" | "MANUAL" | "REOPEN";
export type LockSettings = {
  autoLockMinutes: number;
  lockOnTabLeave: boolean;
  lockOnReopen: boolean;
};

type State = {
  phase: "boot" | "unlocked" | "locked" | "elsewhere";
  reason: LockReason | null;
  lockedAt: string | null;
  settings: LockSettings;
  setPhase: (p: State["phase"]) => void;
  setLocked: (reason: LockReason, lockedAt?: string | null) => void;
  setSettings: (s: LockSettings) => void;
};

export const useLock = create<State>((set) => ({
  phase: "boot",
  reason: null,
  lockedAt: null,
  settings: { autoLockMinutes: 5, lockOnTabLeave: true, lockOnReopen: true },
  setPhase: (phase) => set({ phase }),
  setLocked: (reason, lockedAt) =>
    set({ phase: "locked", reason, lockedAt: lockedAt ?? new Date().toISOString() }),
  setSettings: (settings) => set({ settings }),
}));

/** Passo síncrono do bloqueio (DECISOES §5). */
export function veilOn() {
  document.documentElement.dataset.veil = "on";
}
export function veilOff() {
  delete document.documentElement.dataset.veil;
}

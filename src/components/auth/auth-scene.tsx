"use client";
import { createContext, useContext, useMemo, useState } from "react";

/**
 * The sign-in scene's state. It mirrors the REAL authentication lifecycle and nothing else:
 *   idle → submitting (request in flight) → success (server confirmed the session) | error (rejected / network failure)
 * Only the login form sets "success", and only after the server action returned `ok: true`.
 */
export type ScenePhase = "idle" | "submitting" | "success" | "error";

const Ctx = createContext<{ phase: ScenePhase; setPhase: (p: ScenePhase) => void }>({ phase: "idle", setPhase: () => {} });

export function AuthSceneProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<ScenePhase>("idle");
  const value = useMemo(() => ({ phase, setPhase }), [phase]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useScene = () => useContext(Ctx);

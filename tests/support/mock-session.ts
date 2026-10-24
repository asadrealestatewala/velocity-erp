import { vi } from "vitest";
import type { CurrentUser } from "@/server/auth/session";

/** Lets action tests choose "who is signed in" without HTTP cookies. */
export const session = { current: null as CurrentUser | null };

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "vitest" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

vi.mock("@/server/auth/session", async (orig) => {
  const actual = await orig<typeof import("@/server/auth/session")>();
  return { ...actual, getCurrentUser: async () => session.current };
});

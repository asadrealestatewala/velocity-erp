import "server-only";
import { platformDb } from "./client";

export type SessionRow = { id: string; ipAddress: string | null; userAgent: string | null; createdAt: Date; lastSeenAt: Date | null; expiresAt: Date };

/** Live (unexpired) sessions for one admin, most recently active first. */
export async function listSessions(adminId: string): Promise<SessionRow[]> {
  const rows = await platformDb().platformSession.findMany({ where: { adminId, expiresAt: { gt: new Date() } } });
  return rows.sort((a, b) => (b.lastSeenAt ?? b.createdAt).getTime() - (a.lastSeenAt ?? a.createdAt).getTime());
}

/** Ends one session, but only if it belongs to `adminId`. Returns whether anything was removed. */
export async function revokeSession(adminId: string, sessionId: string): Promise<boolean> {
  return (await platformDb().platformSession.deleteMany({ where: { id: sessionId, adminId } })).count > 0;
}

/** Ends every session of `adminId` except `keepId` (omit to end them all). Returns how many were removed. */
export async function revokeSessions(adminId: string, keepId?: string | null): Promise<number> {
  return (await platformDb().platformSession.deleteMany({ where: { adminId, ...(keepId ? { NOT: { id: keepId } } : {}) } })).count;
}

/** A short human label for a user-agent string ("Chrome on Windows"). */
export function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  return `${browser} on ${os}`;
}

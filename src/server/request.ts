import "server-only";
import { headers } from "next/headers";

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function userAgent() {
  const h = await headers();
  return h.get("user-agent")?.slice(0, 300) ?? null;
}

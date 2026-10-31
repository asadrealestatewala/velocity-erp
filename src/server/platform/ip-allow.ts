import { BlockList, isIP } from "node:net";

/** "::ffff:1.2.3.4" → "1.2.3.4"; lower-cases IPv6. Returns null for anything that is not an address. */
export function normalizeIp(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip = v4 ? v4[1]! : s;
  return isIP(ip) ? ip : null;
}

export type ParsedEntry = { raw: string; ip: string; prefix: number | null; family: "ipv4" | "ipv6" };

/** Accepts `203.0.113.7`, `203.0.113.0/24`, `2001:db8::1`, `2001:db8::/32`. Returns an error message for anything else. */
export function parseEntry(raw: string): ParsedEntry | string {
  const [addr, len, extra] = raw.trim().split("/");
  const ip = addr ? normalizeIp(addr) : null;
  if (!ip || extra !== undefined) return `“${raw.trim()}” is not an IP address or range.`;
  const family = isIP(ip) === 4 ? "ipv4" : "ipv6";
  if (len === undefined) return { raw: raw.trim(), ip, prefix: null, family };
  const prefix = Number(len);
  const max = family === "ipv4" ? 32 : 128;
  if (!/^\d+$/.test(len) || prefix > max) return `“${raw.trim()}” has an invalid range length.`;
  return { raw: raw.trim(), ip, prefix, family };
}

/** Empty list = no restriction. An address that cannot be read is never allowed once a list exists. */
export function ipAllowed(ip: string | null | undefined, list: string[]): boolean {
  if (!list.length) return true;
  const n = ip ? normalizeIp(ip) : null;
  if (!n) return false;
  const bl = new BlockList();
  for (const e of list) {
    const p = parseEntry(e);
    if (typeof p === "string") continue;
    if (p.prefix === null) bl.addAddress(p.ip, p.family);
    else bl.addSubnet(p.ip, p.prefix, p.family);
  }
  return bl.check(n, isIP(n) === 4 ? "ipv4" : "ipv6");
}

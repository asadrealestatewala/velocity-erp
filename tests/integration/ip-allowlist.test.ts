import { describe, expect, it } from "vitest";
import { ipAllowed, normalizeIp, parseEntry } from "@/server/platform/ip-allow";

describe("staff IP allowlist", () => {
  it("allows everyone when the list is empty", () => {
    expect(ipAllowed("198.51.100.9", [])).toBe(true);
    expect(ipAllowed(null, [])).toBe(true);
  });
  it("matches single addresses and ranges", () => {
    const list = ["203.0.113.7", "198.51.100.0/24", "2001:db8::/32"];
    expect(ipAllowed("203.0.113.7", list)).toBe(true);
    expect(ipAllowed("203.0.113.8", list)).toBe(false);
    expect(ipAllowed("198.51.100.200", list)).toBe(true);
    expect(ipAllowed("198.51.101.1", list)).toBe(false);
    expect(ipAllowed("2001:db8:1::5", list)).toBe(true);
    expect(ipAllowed("2001:db9::1", list)).toBe(false);
  });
  it("treats IPv4-mapped IPv6 as the IPv4 address", () => {
    expect(normalizeIp("::FFFF:203.0.113.7")).toBe("203.0.113.7");
    expect(ipAllowed("::ffff:203.0.113.7", ["203.0.113.7"])).toBe(true);
  });
  it("denies unreadable or missing addresses once a list exists", () => {
    expect(ipAllowed(null, ["203.0.113.7"])).toBe(false);
    expect(ipAllowed("unknown", ["203.0.113.7"])).toBe(false);
  });
  it("rejects malformed entries", () => {
    for (const bad of ["abc", "203.0.113.7/33", "203.0.113.7/x", "1.2.3.4/8/9", "999.1.1.1", "2001:db8::/129"]) expect(typeof parseEntry(bad)).toBe("string");
    expect(typeof parseEntry("10.0.0.0/8")).toBe("object");
  });
});

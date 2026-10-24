import { describe, expect, it } from "vitest";
import { listMigrations } from "@/server/platform/migrate";
import { EMBEDDED_MIGRATIONS } from "@/server/platform/migrations.generated";

describe("embedded migrations", () => {
  it("match prisma/migrations exactly (run `node scripts/embed-migrations.mjs` after adding a migration)", () => {
    const onDisk = listMigrations();
    expect(EMBEDDED_MIGRATIONS.map((m) => m.name)).toEqual(onDisk.map((m) => m.name));
    for (const m of onDisk) expect(EMBEDDED_MIGRATIONS.find((e) => e.name === m.name)?.sql).toBe(m.sql);
  });
});

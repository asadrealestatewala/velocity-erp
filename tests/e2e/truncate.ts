import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
if (!/test/i.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to truncate a non-test database");

(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.$disconnect();
})();

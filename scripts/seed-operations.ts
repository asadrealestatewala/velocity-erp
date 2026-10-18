// `npm run db:seed:operations` — add the operations demo data (procurement user, stock, orders, ledger, vouchers, documents)
// to an existing demo database. Idempotent. Refuses to run in production.
import { seedOperations } from "../prisma/seed-operations";
import { db } from "../src/lib/db";

seedOperations()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

// `npm run db:sync` — apply the permission catalogue / default roles to an existing database.
import { syncPermissionCatalog } from "../src/server/permission-sync";
import { db } from "../src/lib/db";

syncPermissionCatalog()
  .then((r) => console.log("Permission catalogue synced:", JSON.stringify(r)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

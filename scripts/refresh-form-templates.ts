/**
 * Non-destructive maintenance: re-applies the standard template fields to the three default forms
 * (by slug) and publishes them as a NEW version. Earlier versions and their submissions are untouched.
 *
 *   npx tsx --conditions=react-server scripts/refresh-form-templates.ts
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { DEALERSHIP_APPLICATION_FORM, GENERAL_INQUIRY_FORM, TEST_DRIVE_FORM } from "../src/lib/forms/defaults";

const db = new PrismaClient();

async function main() {
  for (const tpl of [TEST_DRIVE_FORM, GENERAL_INQUIRY_FORM, DEALERSHIP_APPLICATION_FORM]) {
    const form = await db.form.findUnique({ where: { slug: tpl.slug }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!form) {
      console.log(`skip ${tpl.slug}: not found`);
      continue;
    }
    const schema = { fields: tpl.fields } as unknown as Prisma.InputJsonValue;
    const settings = tpl.settings as unknown as Prisma.InputJsonValue;
    const latest = form.versions[0];
    if (latest && JSON.stringify(latest.schema) === JSON.stringify(schema) && JSON.stringify(latest.settings) === JSON.stringify(settings)) {
      console.log(`${tpl.slug}: already up to date (v${latest.version})`);
      continue;
    }
    const version = (latest?.version ?? 0) + 1;
    await db.$transaction(async (tx) => {
      const v = await tx.formVersion.create({ data: { formId: form.id, version, schema, settings } });
      await tx.form.update({ where: { id: form.id }, data: { draftSchema: schema, draftSettings: settings, publishedVersionId: v.id, status: "PUBLISHED" } });
    });
    console.log(`${tpl.slug}: published v${version}`);
  }
}

main().finally(() => db.$disconnect());

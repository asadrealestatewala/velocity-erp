import { expect, type Page } from "@playwright/test";

// Seeded LOCAL test accounts (see prisma/seed.ts). Never valid outside the seeded test database.
export const PASSWORD = process.env.SEED_PASSWORD || "Yadea@Dev2026";

/** `identifier` is an email address or a mobile number. `area`: true/"portal" = dealer portal, "procurement", or the central CRM. */
export async function signIn(page: Page, identifier: string, area: boolean | "portal" | "procurement" = false) {
  const where = area === true || area === "portal" ? "portal" : area === "procurement" ? "procurement" : "crm";
  await page.goto(where === "portal" ? "/portal/login" : where === "procurement" ? "/procurement/login" : "/login");
  await page.getByLabel("Email or mobile number", { exact: true }).fill(identifier);
  // exact: the demo-accounts panel has a "Copy demo password" button that would also match a substring.
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(where === "portal" ? /\/portal\/dashboard/ : where === "procurement" ? /\/procurement\/dashboard/ : /\/crm\/dashboard/, { timeout: 90_000 });
}

/** Digits of a displayed amount such as "Rs 1,241,500" → 1241500. */
export function amount(text: string | null) {
  return Number((text ?? "").replace(/[^\d]/g, ""));
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** A future weekday (Mon–Sat; seeded outlets are closed on Sundays). */
export function nextOpenDay(daysAhead = 2) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" });
  for (let i = daysAhead; ; i++) {
    const iso = fmt.format(new Date(Date.now() + i * 86400_000));
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() !== 0) return iso;
  }
}

/** Select the first <option> whose text matches (Playwright's selectOption needs exact labels). */
export async function selectByText(select: import("@playwright/test").Locator, text: RegExp) {
  await expect(select.locator("option", { hasText: text }).first()).toBeAttached();
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  await select.selectOption(value!);
}

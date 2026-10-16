import { expect, test } from "@playwright/test";
import { nextOpenDay, selectByText, signIn, signOut } from "./helpers";

test.describe.configure({ mode: "serial" });

test("1. a visitor books a test drive and the lead appears in the selected dealership's portal only", async ({ page }) => {
  await page.goto("/forms/test-drive");
  await page.getByLabel("First Name").fill("Playwright");
  await page.getByLabel("Last Name").fill("Visitor");
  await page.getByLabel("Phone").fill("+92 301 7654321");
  await page.getByLabel("Email").fill("pw.visitor@example.com");
  await page.getByLabel("Preferred Test-Drive Date").fill(nextOpenDay());
  await page.getByLabel("Preferred Time").fill("14:00");
  await page.getByLabel("Interested Model").selectOption({ label: "Sample E-Moped S1" });

  const outlet = page.getByLabel("Outlet");
  await expect(outlet).toBeDisabled(); // no city yet
  await page.getByLabel("City").selectOption({ label: "Lahore" });
  await expect(outlet.locator("option")).toHaveCount(3); // placeholder + both Lahore outlets
  await page.getByLabel("City").selectOption({ label: "Karachi" });
  await expect(outlet.locator("option", { hasText: "Clifton" })).toHaveCount(1);
  await expect(outlet).toHaveValue(""); // changing city cleared the selection
  await page.getByLabel("City").selectOption({ label: "Lahore" });
  await selectByText(outlet, /DHA Ride Hub/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Book Now" }).click();
  await expect(page.getByText("Test drive requested!")).toBeVisible({ timeout: 60_000 });

  await signIn(page, "manager.dha@yadea-demo.local", true);
  await page.goto("/portal/leads?origin=COMPANY");
  await expect(page.getByRole("link", { name: "Playwright Visitor" })).toBeVisible();

  await signOut(page);
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.goto("/portal/leads?q=Playwright");
  await expect(page.getByText("No leads here yet")).toBeVisible();
});

test("2. a YADEA employee manually assigns an unassigned lead to a dealership", async ({ page }) => {
  await signIn(page, "crm1@yadea-demo.local");
  await page.goto("/crm/contacts?assigned=no");
  const first = page.locator("table a[href^='/crm/contacts/c']").first();
  const name = (await first.textContent())!.trim();
  await first.click();
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await selectByText(page.getByLabel("Dealership / outlet"), /Clifton EV Center/);
  await page.getByLabel("Reason (optional)").fill("Customer relocated to Karachi");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByText("Lead assigned.")).toBeVisible();
  await expect(page.getByText("Customer relocated to Karachi").first()).toBeVisible();
  await expect(page.getByText("Clifton EV Center (Demo)").first()).toBeVisible();
});

test("3. a dealership representative creates a walk-in lead and schedules its follow-up", async ({ page }) => {
  await signIn(page, "rep1.gulberg@yadea-demo.local", true);
  await page.goto("/portal/leads/new");
  await page.getByLabel("First name").fill("Walkin");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel(/^Phone/).fill("0345 1239876");
  await page.getByLabel("Interested bike model").selectOption({ label: "Sample E-Bike C1" });
  await page.getByRole("button", { name: "Create walk-in lead" }).click();
  await expect(page.getByRole("heading", { name: /Walkin Tester/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Walk-in", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Follow-up" }).click();
  await page.getByLabel("Title").fill("Call Walkin about financing");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText("Follow-up scheduled.")).toBeVisible();

  await page.goto("/portal/leads?origin=DEALERSHIP_WALK_IN");
  await expect(page.getByRole("link", { name: "Walkin Tester" })).toBeVisible();
  await page.goto("/portal/tasks");
  await expect(page.getByText("Call Walkin about financing")).toBeVisible();
});

test("4. a manager reviews a dealership application and initiates onboarding after approval", async ({ page }) => {
  await signIn(page, "management@yadea-demo.local");
  await page.goto("/crm/applications?status=SUBMITTED");
  await page.locator("table a[href^='/crm/applications/c']").first().click();
  await page.getByRole("button", { name: "Start review" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Record the reason for this decision.").first()).toBeVisible(); // reason enforced server-side
  await page.getByLabel(/Reason for decision/).fill("Strong local presence and showroom ready");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Approved\. Continue with onboarding/)).toBeVisible();
  await expect(page.getByText("Onboarding", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark verified" }).click();
  await expect(page.getByText("Business information marked as verified.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create dealership" })).toBeEnabled();
});

test("5. an administrator creates and publishes a new form through the form builder", async ({ page }) => {
  await signIn(page, "admin@yadea-demo.local");
  await page.goto("/crm/forms");
  await page.getByRole("button", { name: "New form" }).click();
  await page.getByLabel("Form name").fill("Spring Event Signup");
  await page.getByRole("button", { name: "Create & open builder" }).click();
  await expect(page).toHaveURL(/\/crm\/forms\/c/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Dropdown" }).click();
  await page.getByLabel("Label", { exact: true }).fill("How did you hear about us?");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published version 1.")).toBeVisible();

  await signOut(page);
  await page.goto("/forms/spring-event-signup");
  await expect(page.getByRole("heading", { name: "Spring Event Signup" }).first()).toBeVisible();
  await expect(page.getByLabel("How did you hear about us?")).toBeVisible();
});

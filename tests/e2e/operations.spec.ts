import { expect, test, type Page } from "@playwright/test";
import { amount, selectByText, signIn, signOut } from "./helpers";

test.describe.configure({ mode: "serial" });

const GULBERG_MOBILE = "0300 0000111"; // seeded manager.gulberg — signs in with the mobile number
const PROCUREMENT = "procurement@yadea-demo.local";
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e proof document\n") });

/** Quantity shown in the dealer inventory for an item (bikes or parts tab). */
async function stockOf(page: Page, item: string, tab: "bikes" | "parts") {
  await page.goto(`/portal/inventory?type=${tab}`);
  const row = page.getByRole("row").filter({ hasText: item }).first();
  await expect(row).toBeVisible();
  return amount(await row.locator("td").nth(tab === "parts" ? 3 : 2).textContent());
}

test("5. a dealership signs in with its mobile number, sells a bike and the showroom stock drops", async ({ page }) => {
  await signIn(page, GULBERG_MOBILE, true);
  const before = await stockOf(page, "GT70", "bikes");
  expect(before).toBeGreaterThan(1);

  await page.goto("/portal/sales-orders/new");
  await page.getByLabel("…or customer name").fill("E2E Walk-in Customer");
  await selectByText(page.getByLabel("Item").first(), /GT70/);
  await page.getByLabel("Unit price (PKR)").first().fill("200000");
  await page.getByRole("button", { name: /Confirm order & deduct stock/ }).click();
  await expect(page.getByRole("heading", { name: /Order SO-\d+/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("−1").or(page.getByText("-1")).first()).toBeVisible(); // the stock impact card

  expect(await stockOf(page, "GT70", "bikes")).toBe(before - 1);

  // cancelling the confirmed order puts the bike back
  await page.goto("/portal/sales-orders");
  await page.getByRole("link", { name: /SO-\d+/ }).first().click();
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText(/cancelled — stock restored/i).first()).toBeVisible();
  expect(await stockOf(page, "GT70", "bikes")).toBe(before);
});

test("6. a dealership orders spare parts, procurement approves and delivers, the dealer confirms receipt and stock rises", async ({ page }) => {
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  const before = await stockOf(page, "Brake pad set — rear", "parts");

  await page.goto("/portal/stock-orders/new");
  await page.getByRole("tab", { name: /Spare parts/ }).click();
  await page.getByLabel("Quantity of Brake pad set — rear").fill("5");
  await page.getByRole("button", { name: "Send order to YADEA" }).click();
  await expect(page.getByRole("heading", { name: /Stock order PO-\d+/ })).toBeVisible({ timeout: 60_000 });
  const orderUrl = page.url();
  const poNumber = (await page.getByRole("heading", { name: /Stock order PO-\d+/ }).textContent())!.match(/PO-(\d+)/)![1]!;

  await signOut(page);
  await signIn(page, PROCUREMENT, "procurement");
  await page.goto(`/procurement/orders?q=${poNumber}`);
  await page.getByRole("link", { name: `PO-${poNumber}` }).first().click();
  await expect(page.getByRole("heading", { name: new RegExp(`Order PO-${poNumber}\\b`) })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByLabel("Expected delivery date").fill(new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Approve order" }).click();
  await expect(page.getByText(`PO-${poNumber} approved.`)).toBeVisible();

  await page.getByRole("button", { name: "Update delivery" }).click();
  await page.getByLabel("New status").selectOption("DELIVERED");
  await page.getByLabel("Courier").fill("E2E Courier");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText(/marked delivered/i)).toBeVisible();

  await signOut(page);
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.goto(orderUrl);
  await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
  expect(await stockOf(page, "Brake pad set — rear", "parts")).toBe(before); // delivery alone doesn't change stock
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await page.getByRole("button", { name: "Add to my stock" }).click();
  await expect(page.getByText(/stock is updated/i)).toBeVisible();
  expect(await stockOf(page, "Brake pad set — rear", "parts")).toBe(before + 5);
});

test("7. a dealership reports a payment with proof; the balance only moves once procurement verifies it", async ({ page }) => {
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.goto("/portal/ledger");
  const paidBefore = amount(await page.locator(".card", { hasText: "Total paid" }).first().locator("p.text-\\[34px\\]").textContent());
  const owedBefore = amount(await page.locator(".card", { hasText: "Balance owed to YADEA" }).first().locator("p.text-\\[34px\\]").textContent());

  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel(/^Amount/).fill("12345");
  await page.getByLabel(/Transaction/).fill("E2E-TX-1");
  await page.getByLabel("Choose file").setInputFiles(pdf("bank-slip.pdf"));
  await page.getByRole("button", { name: "Submit payment" }).click();
  await expect(page.getByText(/will verify it against your proof/)).toBeVisible();
  await expect(page.getByText("Awaiting verification").first()).toBeVisible();
  // not applied yet
  expect(amount(await page.locator(".card", { hasText: "Total paid" }).first().locator("p.text-\\[34px\\]").textContent())).toBe(paidBefore);

  await signOut(page);
  await signIn(page, PROCUREMENT, "procurement");
  await page.goto("/procurement/ledger");
  const row = page.getByRole("row").filter({ hasText: "E2E-TX-1" });
  await expect(row.getByRole("link", { name: /Proof of payment/ })).toBeVisible();
  await row.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/balance updated/i)).toBeVisible();

  await signOut(page);
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.goto("/portal/ledger");
  expect(amount(await page.locator(".card", { hasText: "Total paid" }).first().locator("p.text-\\[34px\\]").textContent())).toBe(paidBefore + 12345);
  expect(amount(await page.locator(".card", { hasText: "Balance owed to YADEA" }).first().locator("p.text-\\[34px\\]").textContent())).toBe(owedBefore - 12345);

  // the ledger downloads as Excel and PDF
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^ledger-LHR-01-.*\.xlsx$/);
  const [doc] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "PDF" }).click()]);
  expect(doc.suggestedFilename()).toMatch(/\.pdf$/);
});

test("8. expense vouchers keep invoice, proof of invoice and proof of payment for tax records", async ({ page }) => {
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.goto("/portal/vouchers");
  await page.getByRole("button", { name: "New voucher" }).click();
  await page.getByLabel(/^Amount/).fill("23600");
  await page.getByLabel(/^Of which tax/).fill("3600");
  await page.getByLabel("Paid to").fill("E2E Supplier");
  await page.getByLabel("Document type").first().selectOption("INVOICE");
  await page.getByLabel("Choose file").first().setInputFiles(pdf("invoice.pdf"));
  await page.getByRole("button", { name: "Attach another document" }).click();
  await page.getByLabel("Document type").nth(1).selectOption("PROOF_OF_PAYMENT");
  await page.getByLabel("Choose file").nth(1).setInputFiles(pdf("payment.pdf"));
  await page.getByRole("button", { name: "Save voucher" }).click();
  await expect(page.getByText(/Voucher EV-\d+ saved/)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "E2E Supplier" });
  await expect(row.getByText("Invoice")).toBeVisible();
  await expect(row.getByText("Proof of payment")).toBeVisible();

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Excel/ }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^vouchers-.*\.xlsx$/);

  await signOut(page);
  await signIn(page, PROCUREMENT, "procurement");
  await page.goto("/procurement/vouchers?q=E2E");
  const central = page.getByRole("row").filter({ hasText: "E2E Supplier" });
  await central.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/approved\./)).toBeVisible();
});

test("9. documents stay in sync: the dealer uploads its registration, YADEA issues an achievement certificate", async ({ page }) => {
  await signIn(page, "manager.bluearea@yadea-demo.local", true);
  await page.goto("/portal/documents");
  await expect(page.getByText("hasn't been uploaded yet")).toBeVisible();
  await page.getByRole("button", { name: "Upload document" }).click();
  await selectByText(page.getByLabel("Type"), /Certificate of registration/);
  await page.getByLabel("Title").fill("E2E registration certificate");
  await page.getByLabel(/^File/).setInputFiles(pdf("registration.pdf"));
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText(/shared with YADEA/i)).toBeVisible();
  await expect(page.getByText("E2E registration certificate")).toBeVisible();

  await signOut(page);
  await signIn(page, PROCUREMENT, "procurement");
  await page.goto("/procurement/dealers");
  await page.getByRole("link", { name: /Blue Area Motors/ }).click();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByText("E2E registration certificate")).toBeVisible(); // synced to the admin side
  await page.getByRole("button", { name: "Issue certificate" }).click();
  await page.getByLabel("Title").fill("E2E Top Dealer 2026");
  await page.getByLabel(/^File/).setInputFiles(pdf("certificate.pdf"));
  await page.getByRole("button", { name: "Issue certificate" }).last().click();
  await expect(page.getByText(/Shared with Blue Area Motors/)).toBeVisible();

  await signOut(page);
  await signIn(page, "manager.bluearea@yadea-demo.local", true);
  await page.goto("/portal/documents");
  await expect(page.getByText("E2E Top Dealer 2026")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("row").or(page.locator("li")).filter({ hasText: "E2E Top Dealer 2026" }).getByRole("link", { name: "Download" }).click()]);
  expect(dl.suggestedFilename()).toBe("certificate.pdf");
});

test("10. a dealership audit log shows its own activity", async ({ page }) => {
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.goto("/portal/audit");
  await expect(page.getByText("Customer order confirmed").first()).toBeVisible();
  await expect(page.getByText("Stock order placed").first()).toBeVisible();
  // another dealership's manager never sees those entries
  await signOut(page);
  await signIn(page, "manager.dha@yadea-demo.local", true);
  await page.goto("/portal/audit");
  await expect(page.getByText("Customer order confirmed")).toHaveCount(0);
});

test("11. a contact's chat tab is honest when WhatsApp is not connected, and conversations can be logged", async ({ page }) => {
  await signIn(page, "rep1.gulberg@yadea-demo.local", true);
  await page.goto("/portal/leads?view=mine");
  await page.locator("table a[href^='/portal/contacts/c']").first().click();
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(page.getByText("isn't connected to the CRM yet")).toBeVisible();
  await page.getByRole("button", { name: "Log a conversation" }).click();
  await page.getByLabel("Message").fill("Customer called on WhatsApp to ask about the GT70 colours.");
  await page.getByRole("button", { name: "Save to contact" }).click();
  await expect(page.getByText("Conversation logged.")).toBeVisible();
  await expect(page.getByText("Customer called on WhatsApp")).toBeVisible();
  await expect(page.getByText("Logged manually").first()).toBeVisible();
});

test("12. the assistant answers from the built-in guide when no AI key is configured", async ({ page }) => {
  await signIn(page, "manager.gulberg@yadea-demo.local", true);
  await page.getByRole("button", { name: "Open the Velocity assistant" }).click();
  await expect(page.getByText("AI not connected")).toBeVisible();
  await page.getByLabel("Message the assistant").fill("How do customer orders deduct stock?");
  await page.getByRole("button", { name: "Send" }).click();
  const panel = page.getByRole("dialog", { name: "Velocity assistant" });
  await expect(panel.getByText(/deducts every line in one step/i)).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText("Built-in guide answer")).toBeVisible();
  // the answer links to the screen, and the link works
  await panel.getByRole("link", { name: "Customer Orders" }).click();
  await expect(page).toHaveURL(/\/portal\/sales-orders$/);
});

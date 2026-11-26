import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => fileURLToPath(new URL(`../../../fixtures/documents/${name}`, import.meta.url));

const card = (page: Page, field: string) =>
  page.getByRole("article").filter({ has: page.getByRole("heading", { name: field, exact: true }) });
const badges = (page: Page, text: string) => page.getByRole("article").getByText(text, { exact: true });

test("review an invoice, upload its revision, and only the changed values come back", async ({ page }) => {
  // Upload v1 from the list page.
  await page.goto("/");
  await page.getByLabel("Type").selectOption("invoice");
  await page.getByLabel("Title (optional)").fill("E2E invoice");
  await page.getByLabel("PDF", { exact: true }).setInputFiles(fixture("invoice-001.pdf"));
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\//);

  // The worker extracts it; the page polls until the values appear.
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(badges(page, "Needs review")).toHaveCount(5);
  await expect(card(page, "Total amount")).toContainText("Total Due:");

  // Correct the vendor name with a note, approve the rest.
  const vendor = card(page, "Vendor name");
  await vendor.getByRole("button", { name: "Correct" }).click();
  await vendor.getByLabel("Correct value").fill("Meridian Office Supplies LLC");
  await vendor.getByLabel("Note (optional)").fill("Legal name");
  await vendor.getByRole("button", { name: "Save correction" }).click();
  await expect(vendor.getByText("Corrected", { exact: true })).toBeVisible();
  for (let left = 4; left > 0; left--) {
    await page
      .getByRole("article")
      .filter({ hasText: "Needs review" })
      .first()
      .getByRole("button", { name: "Approve" })
      .click();
    await expect(badges(page, "Needs review")).toHaveCount(left - 1);
  }

  // Upload the revised invoice as version 2.
  await page.getByLabel("Revised PDF").setInputFiles(fixture("invoice-001.v2.pdf"));
  await page.getByRole("button", { name: "Upload new version" }).click();

  // Exactly the two changed fields need review again; the rest carried over.
  await expect(badges(page, "Needs review")).toHaveCount(2);
  await expect(badges(page, "Carried over")).toHaveCount(3);
  await expect(card(page, "Due date")).toContainText("Changed since v1");
  await expect(card(page, "Due date")).toContainText("Was 2025-10-14, approved");
  await expect(card(page, "Total amount")).toContainText("Changed since v1");
  await expect(card(page, "Vendor name")).toContainText("Corrected to Meridian Office Supplies LLC");
  await expect(card(page, "Invoice number").getByText("Carried over", { exact: true })).toBeVisible();

  // Version 1 is still there, read-only.
  await page.getByRole("navigation", { name: "Versions" }).getByRole("link", { name: "v1" }).click();
  await expect(page.getByText(/earlier version\. It is read-only/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("a field the document does not state is a visible gap", async ({ page, request }) => {
  const upload = await request.post("http://localhost:3001/documents", {
    multipart: {
      type: "market_report",
      title: "E2E market report",
      file: {
        name: "report.pdf",
        mimeType: "application/pdf",
        buffer: readFileSync(fixture("market-report-excerpt-001.pdf")),
      },
    },
  });
  expect(upload.status()).toBe(202);
  const { documentId } = (await upload.json()) as { documentId: string };

  await page.goto(`/documents/${documentId}`);
  const income = card(page, "Median household income");
  await expect(income).toContainText("Gap · needs review");
  await expect(income).toContainText("Not stated in the document.");
  await expect(badges(page, "Needs review")).toHaveCount(5);
});

import { test, expect } from "./fixtures";

test.describe("public pages render", () => {
  test("home page loads with branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/LuxApts/);
  });

  test("cities index links through to a city page", async ({ page }) => {
    await page.goto("/cities");
    const cityLink = page.locator('a[href^="/cities/"]').first();
    await expect(cityLink).toBeVisible();
    await cityLink.click();
    await expect(page).toHaveURL(/\/cities\/[a-z0-9-]+/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("auth pages render their forms", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("shower registration page is reachable (no redirect loop)", async ({ page }) => {
    const response = await page.goto("/shower/profile");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/shower\/profile/);
  });
});

test.describe("search and listings", () => {
  test("search returns listing cards", async ({ page }) => {
    await page.goto("/search");
    // Cards carry the compare toggle — presence means real results rendered
    await expect(page.locator('[title="Add to compare"]').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("building page opens from search with tour CTA", async ({ page }) => {
    await page.goto("/search");
    const card = page.locator('a[href^="/buildings/"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(page).toHaveURL(/\/buildings\/[0-9a-f-]+/);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("button", { name: /Schedule a Tour/i }).first()).toBeVisible();
  });

  test("schedule tour modal opens with required fields", async ({ page }) => {
    await page.goto("/search");
    const card = page.locator('a[href^="/buildings/"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await page.getByRole("button", { name: /Schedule a Tour/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input").first()).toBeVisible();
  });
});

test.describe("favorites and compare (shared local stores)", () => {
  test("saving a listing shows it on the favorites page", async ({ page }) => {
    await page.goto("/search");
    const saveButton = page.locator('[aria-label="Save listing"]').first();
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    await saveButton.click();
    // Button flips to "remove" state via the shared store
    await expect(page.locator('[aria-label="Remove from saved listings"]').first()).toBeVisible();

    await page.goto("/favorites");
    await expect(page.locator('a[href^="/buildings/"]').first()).toBeVisible();
  });

  test("adding two buildings raises the CompareBar and opens compare", async ({ page }) => {
    await page.goto("/search");
    const compareButtons = page.locator('[title="Add to compare"]');
    await expect(compareButtons.first()).toBeVisible({ timeout: 30_000 });

    await compareButtons.nth(0).click();
    // Regression check for the shared-store fix: the CompareBar (mounted in
    // the root layout) must react to CompareButton clicks without a reload
    await expect(page.getByText(/Compare \(1\/3\)/)).toBeVisible();

    await compareButtons.nth(1).click();
    await expect(page.getByText(/Compare \(2\/3\)/)).toBeVisible();

    await page.getByRole("button", { name: /Compare Now/i }).click();
    await expect(page).toHaveURL(/\/compare/);
  });
});

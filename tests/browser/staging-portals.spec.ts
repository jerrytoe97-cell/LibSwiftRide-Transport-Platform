import { expect, test, type Page } from "@playwright/test";

const staging = {
  web: process.env.STAGING_WEB_URL ?? "https://libswiftride-web.onrender.com",
  passenger: process.env.STAGING_PASSENGER_URL ?? "https://libswiftride-passenger.onrender.com",
  driver: process.env.STAGING_DRIVER_URL ?? "https://libswiftride-driver.onrender.com",
  fleet: process.env.STAGING_FLEET_URL ?? "https://libswiftride-fleet.onrender.com",
  admin: process.env.STAGING_ADMIN_URL ?? "https://libswiftride-admin.onrender.com",
  dispatcher: process.env.STAGING_DISPATCHER_URL ?? "https://libswiftride-dispatcher.onrender.com",
  business: process.env.STAGING_BUSINESS_URL ?? "https://libswiftride-business.onrender.com",
  api: process.env.STAGING_API_URL ?? "https://libswiftride-transport-platform.onrender.com",
} as const;

const portals = [
  ["Passenger", staging.passenger, true],
  ["Driver", staging.driver, true],
  ["Fleet", staging.fleet, false],
  ["Admin", staging.admin, false],
  ["Dispatcher", staging.dispatcher, false],
  ["Business", staging.business, false],
] as const;

async function expectHealthyDocument(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response, `No document response received for ${url}`).not.toBeNull();
  expect(response?.status(), `${url} did not return a successful document`).toBeLessThan(400);
  await expect(page.locator("main")).toBeVisible();
}

test("API is live and ready", async ({ request }) => {
  for (const endpoint of ["/health/live", "/health/ready"]) {
    const response = await request.get(`${staging.api}${endpoint}`);
    expect(response.status(), endpoint).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/application\/json/);
  }
});

test("public website opens and links to public role entry points", async ({ page }) => {
  await expectHealthyDocument(page, staging.web);
  await expect(page.getByRole("link", { name: /LibSwiftRide official logo LibSwiftRide/i }).first()).toBeVisible();
  await expect(page.locator(`a[href="${staging.passenger}"]`).first()).toHaveCount(1);
  await expect(page.locator(`a[href="${staging.driver}"]`).first()).toHaveCount(1);
  await expect(page.locator(`a[href="${staging.business}"]`).first()).toHaveCount(1);
});

test("passenger portal preserves the screen and offers recovery when offline", async ({ page, context }) => {
  await expectHealthyDocument(page, staging.passenger);
  await context.setOffline(true);
  await expect(page.getByRole("alert")).toContainText("You are offline");
  await expect(page.getByRole("button", { name: "Try connection again" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to Passenger" })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("driver portal preserves sign-in and recovery guidance when offline", async ({ page, context }) => {
  await expectHealthyDocument(page, staging.driver);
  await context.setOffline(true);
  await expect(page.getByRole("alert")).toContainText("Live maps, booking, GPS sharing and account changes are paused");
  await expect(page.getByRole("button", { name: "Try connection again" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to Driver" })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("mobile public entry points have no horizontal overflow and expose a skip link", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only responsive check");
  for (const url of [staging.web, staging.passenger, staging.driver, staging.admin, staging.dispatcher, staging.fleet, staging.business]) {
    await expectHealthyDocument(page, url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${url} overflows horizontally`).toBe(true);
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(await page.locator("main h1").count(), `${url} needs one primary heading`).toBeGreaterThanOrEqual(1);
  }
});

test("staff login enters the MFA challenge without creating a password-only session", async ({ page }) => {
  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "synthetic-admin", role: "ADMIN" }, mfaRequired: true, challengeToken: "a".repeat(64) }) }));
  await expectHealthyDocument(page, staging.admin);
  await page.getByLabel("Mobile number").fill("+231000000000");
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-only-Password-1!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Verify your secure sign-in" })).toBeVisible();
  await expect(page.getByLabel("Authenticator or recovery code")).toBeVisible();
  expect(await page.evaluate(() => Boolean(localStorage.getItem("lsr_access_token") || sessionStorage.getItem("lsr_access_token")))).toBe(false);
});

for (const [product, url, allowsRegistration] of portals) {
  test(`${product} portal exposes the correct protected authentication entry`, async ({ page }) => {
    await expectHealthyDocument(page, url);
    await expect(page.getByRole("heading", { name: `Sign in to ${product}` })).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();

    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (await menu.isVisible()) await menu.click();
    for (const [navProduct, navUrl] of portals) {
      const navLabel = navProduct === "Dispatcher" ? "Dispatch" : navProduct;
      await expect(page.getByRole("navigation", { name: "Platform applications" }).getByRole("link", { name: navLabel, exact: true })).toHaveAttribute("href", navUrl);
    }

    const registrationLink = page.getByRole("button", { name: /create an account/i });
    if (allowsRegistration) await expect(registrationLink).toBeVisible();
    else await expect(registrationLink).toHaveCount(0);
  });

  test(`${product} login posts only to the shared API origin`, async ({ page }) => {
    let requestedUrl = "";
    await page.route("**/api/v1/auth/login", async (route) => {
      requestedUrl = route.request().url();
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Synthetic browser-smoke rejection" } }),
      });
    });

    await expectHealthyDocument(page, url);
    await page.getByLabel("Mobile number").fill("+231000000000");
    await page.getByLabel("Password", { exact: true }).fill("Synthetic-only-Password-1!");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect.poll(() => requestedUrl).toBe(`${staging.api}/api/v1/auth/login`);
    await expect(page.getByRole("alert")).toContainText("Synthetic browser-smoke rejection");
  });
}

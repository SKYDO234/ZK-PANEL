import { test, expect } from "@playwright/test";

test("all principal pages render without runtime exceptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const route of [
    "/",
    "/servers",
    "/servers/new",
    "/ziyn",
    "/autopilot",
    "/billing",
    "/nodes",
    "/discord",
    "/activity",
    "/admin",
    "/settings",
    "/servers/survival-smp",
    "/servers/survival-smp/files",
    "/servers/survival-smp/backups",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".error-state")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("mobile navigation fits the viewport and opens accessibly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar.open")).toBeVisible();
  await page
    .locator(".sidebar.open")
    .getByRole("link", { name: "ZIYN library" })
    .click();
  await expect(
    page.getByRole("heading", { name: "The ZIYN library" }),
  ).toBeVisible();
});

test("wallet, deployment, console, files, backup/restore and deletion work together", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/billing");
  await page.getByRole("button", { name: "Add funds", exact: true }).click();
  await page.getByRole("button", { name: "₹100", exact: true }).click();
  await page.getByRole("button", { name: "Add demo funds" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/servers/new");
  await page
    .locator(".ziyn-choice")
    .filter({
      has: page.getByRole("heading", { name: "Paper POPULAR", exact: true }),
    })
    .click();
  await page.getByLabel("Deployment name").fill("UI test world");
  await page.getByLabel("Accept the Minecraft EULA").selectOption("TRUE");
  await page.getByRole("button", { name: "Review deployment" }).click();
  await page.getByRole("button", { name: "Launch deployment" }).click();
  await page.waitForURL(/\/servers\/zk-/);
  const base = new URL(page.url()).pathname;
  await expect(page.locator(".server-detail-title")).toContainText("Running", {
    timeout: 20000,
  });
  await page.getByLabel("Console command").fill("list");
  await page.getByLabel("Console command").press("Enter");
  await expect(page.getByRole("log")).toContainText("0 of a max");
  await page.goto(base + "/files");
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("ui-test.txt");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page.getByRole("button", { name: "ui-test.txt", exact: true }).click();
  await page.getByLabel("File content").fill("Saved by the browser test");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/backups");
  await page
    .getByRole("button", { name: "Create backup", exact: true })
    .click();
  await page.getByLabel("Backup name").fill("UI snapshot");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create backup" })
    .click();
  await expect(page.locator(".backup-list")).toContainText("UI snapshot");
  await page.getByRole("button", { name: "Restore UI snapshot" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore backup" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(base + "/settings");
  await page
    .getByRole("button", { name: "Delete deployment", exact: true })
    .click();
  await page.getByPlaceholder("Type the deployment name").fill("UI test world");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL("**/servers");
  await expect(page.locator("main")).not.toContainText("UI test world");
});


test("signed-out real mode shows the login form instead of a boot error", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { mode: "docker", autoDemo: false, devBootstrap: false, registration: false } }));
  await page.route("**/api/bootstrap", route => route.fulfill({ status: 401, json: { error: "Please sign in to continue." } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good to have you back." })).toBeVisible();
  await expect(page.getByLabel("Username or email")).toBeVisible();
  await expect(page.locator(".error-state")).toHaveCount(0);
});

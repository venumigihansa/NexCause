import { expect, test } from "@playwright/test";

const me = {
  user: {
    id: "user-1",
    subject: "asgardeo|user-1",
    email: "gihansa@example.com",
    displayName: "Gihansa",
  },
  workspace: {
    id: "workspace-1",
    organizationId: "org-1",
  },
  roles: ["Administrator"],
  permissions: [
    "apps:create",
    "builds:start",
    "deployments:write",
    "deployments:delete",
    "logs:read",
    "members:manage",
  ],
  csrfToken: "csrf-test-token",
};

test("login screen renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "NexCause" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with Asgardeo" })).toHaveAttribute(
    "href",
    "/auth/login",
  );
});

test("authenticated app shell renders without text collisions", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => route.fulfill({ json: me }));
  await page.route("**/api/apps", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/incidents?status=open", async (route) =>
    route.fulfill({ json: [] }),
  );

  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operational command center" })).toBeVisible();
  await expect(page.getByText("No apps yet")).toBeVisible();
});

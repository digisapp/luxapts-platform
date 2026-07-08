import { test as base } from "@playwright/test";

/**
 * Smoke tests run against the real dev server, which talks to the real
 * Supabase project. Block every endpoint with side effects (DB writes,
 * outbound email, paid avatar sessions) so test runs leave no trace.
 */
export const test = base.extend({
  // Param named `provide` (not Playwright's conventional `use`) so eslint's
  // react-hooks/rules-of-hooks doesn't misread it as the React `use` hook.
  context: async ({ context }, provide) => {
    await context.route("**/api/analytics/**", (route) =>
      route.fulfill({ status: 204, body: "" })
    );
    await context.route("**/api/leads", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ blocked_by_e2e: true }),
      })
    );
    await context.route("**/api/simli/session", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "blocked in e2e" }),
      })
    );
    await provide(context);
  },
});

export { expect } from "@playwright/test";

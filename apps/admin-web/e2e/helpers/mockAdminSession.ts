import type { Page, Route } from "@playwright/test";

const BOOTSTRAP_BODY = {
  data: {
    user: {
      id: "e2e-superadmin-user",
      email: "e2e-superadmin@beautonomi.test",
      full_name: "E2E Superadmin",
    },
    role: "superadmin",
    is_superadmin: true,
  },
};

const ASSIST_STATUS_BODY = {
  data: {
    shadow_mode: false,
    mutations_allowed: true,
    master_enabled: true,
    blockers: [],
  },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Mocks admin session + chrome APIs so RequireAuth passes on vite preview (no Next backend).
 * Register page-specific routes after this helper (Playwright uses last matching handler).
 */
export async function mockAdminSession(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/api/admin/bootstrap")) {
      await json(route, BOOTSTRAP_BODY);
      return;
    }
    if (path.includes("/api/admin/settings/section-permissions")) {
      await json(route, { data: { sectionRoles: {} } });
      return;
    }
    if (path.endsWith("/api/admin/nav-counts")) {
      await json(route, { data: {} });
      return;
    }
    if (path.endsWith("/api/admin/tenants")) {
      await json(route, { data: [] });
      return;
    }
    if (path.includes("/api/admin/agents/assist-status")) {
      await json(route, ASSIST_STATUS_BODY);
      return;
    }

    await json(route, { data: [] });
  });
}

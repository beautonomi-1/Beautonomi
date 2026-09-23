import { test, expect, type Page, type Route } from "@playwright/test";
import { mockAdminSession } from "./helpers/mockAdminSession";

const LEAD_A = "550e8400-e29b-41d4-a716-446655440001";
const LEAD_B = "550e8400-e29b-41d4-a716-446655440002";
const LEAD_C = "550e8400-e29b-41d4-a716-446655440003";

function leadRow(id: string, name: string) {
  return {
    id,
    business_name: name,
    contact_person_name: null,
    email: null,
    phone_e164: null,
    commercial_stage: "new",
    source: "manual",
    suggested_location_text: null,
    country: "ZA",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    whatsapp_status: "unknown",
    do_not_contact: false,
    provider_lead_categories: [],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

type LeadsMockOptions = {
  ids: string[];
  total?: number;
  capped?: boolean;
  onBulkStage?: (body: unknown) => void;
  onContactPreview?: (body: unknown) => void;
};

async function mockProviderOpsLeads(page: Page, opts: LeadsMockOptions) {
  const total = opts.total ?? opts.ids.length;
  const listPayload = {
    data: {
      data: [leadRow(LEAD_A, "Alpha Co"), leadRow(LEAD_B, "Beta Co")],
      meta: { page: 1, limit: 50, total, has_more: total > 2 },
      stage_counts: { all: total, new: total },
      filter_options: { countries: [], provinces: [], categories: [], assignees: [] },
    },
  };

  await page.route("**/api/admin/provider-ops/leads**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith("/leads/ids") && method === "GET") {
      await json(route, { data: { ids: opts.ids, total, capped: opts.capped ?? false } });
      return;
    }
    if (path.endsWith("/bulk-stage") && method === "POST") {
      const body = route.request().postDataJSON();
      opts.onBulkStage?.(body);
      await json(route, {
        data: {
          updated: opts.ids,
          conflicts: [],
          skipped: [],
          not_found: [],
        },
      });
      return;
    }
    if (path.endsWith("/contact-preview") && method === "POST") {
      const body = route.request().postDataJSON();
      opts.onContactPreview?.(body);
      await json(route, {
        data: {
          leads: [
            {
              id: LEAD_C,
              business_name: "Gamma Co",
              contact_person_name: null,
              lead_name: null,
              phone_e164: "+27123456789",
              email: null,
              whatsapp_status: "verified",
              do_not_contact: false,
            },
          ],
        },
      });
      return;
    }
    if (path.endsWith("/leads") && method === "GET") {
      await json(route, listPayload);
      return;
    }
    await json(route, { data: [] });
  });
}

async function mockWhatsAppApis(page: Page, onBulkSend?: (body: unknown) => void) {
  const sessionRow = {
    id: "sess-e2e-1",
    name: "E2E Session",
    phone_number: "+27000000000",
    status: "connected",
    is_paused: false,
    daily_send_count: 0,
    hourly_send_count: 0,
  };
  const templateRow = {
    id: "tpl-e2e-1",
    name: "E2E Template",
    category: "marketing",
    body: "Hello from E2E",
  };

  await page.route(/\/api\/admin\/whatsapp\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/whatsapp/sessions") && route.request().method() === "GET") {
      await json(route, { data: [sessionRow] });
      return;
    }
    if (path.endsWith("/whatsapp/templates") && route.request().method() === "GET") {
      await json(route, { data: [templateRow] });
      return;
    }
    if (path.endsWith("/whatsapp/bulk") && route.request().method() === "POST") {
      onBulkSend?.(route.request().postDataJSON());
      await json(route, {
        data: {
          batch_id: "batch-e2e",
          queued_count: 1,
          skipped_count: 0,
          skipped_reasons: [],
          daily_remaining: 199,
          hourly_remaining: 29,
        },
      });
      return;
    }
    await json(route, { data: [] });
  });
}

function agentActionRow(index: number) {
  const id = `550e8400-e29b-41d4-a716-${String(2000 + index).padStart(12, "0")}`;
  return {
    id,
    agent_id: "agent-e2e",
    action_type: "payout.review",
    target_type: "payout",
    target_id: `payout-${index}`,
    status: "proposed",
    risk_level: 2,
    reasoning_summary: "E2E payout review",
    proposed_payload: { amount: 1000, currency: "ZAR" },
    approval_expires_at: null,
    proposed_at: "2026-01-01T00:00:00.000Z",
    approved_at: null,
    executed_at: null,
    last_execution_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

async function mockFinanceAgentActions(
  page: Page,
  count: number,
  onBulk?: (body: { ids?: string[]; decision?: string }) => void,
) {
  const rows = Array.from({ length: count }, (_, i) => agentActionRow(i));
  await page.route("**/api/admin/agent-actions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/agent-actions/bulk") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { ids?: string[]; decision?: string };
      onBulk?.(body);
      const ids = body.ids ?? [];
      await json(route, {
        data: {
          results: ids.map((id) => ({ id, status: "approval_pending" as const })),
        },
      });
      return;
    }
    if (url.pathname.endsWith("/agent-actions") && route.request().method() === "GET") {
      await json(route, { data: rows });
      return;
    }
    await json(route, { data: [] });
  });
}

async function gotoLeadsInbox(page: Page) {
  await page.goto("/admin/provider-ops/leads?view=table", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Lead Inbox" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Alpha Co")).toBeVisible({ timeout: 20_000 });
}

async function selectPageAndSelectAllMatching(page: Page, totalLabel: string) {
  await page.locator("table thead th").first().getByRole("button").click();
  await expect(page.getByText(`All 2 on this page selected.`)).toBeVisible();
  await page.getByRole("button", { name: `Select all ${totalLabel} matching filters` }).click();
  await expect(page.getByText(/bulk cap 500/)).toBeVisible();
  await expect(page.getByText(/Off-page selections skip version checks/)).toBeVisible();
}

test.describe("provider ops bulk (mocked session)", () => {
  test("select-all matching → bulk stage omits expected_updated_at and shows toast", async ({ page }) => {
    await mockAdminSession(page);
    let bulkBody: { stage?: string; items?: { id: string; expected_updated_at?: string }[] } | null = null;
    await mockProviderOpsLeads(page, {
      ids: [LEAD_A, LEAD_B, LEAD_C],
      total: 3,
      onBulkStage: (body) => {
        bulkBody = body as typeof bulkBody;
      },
    });

    await gotoLeadsInbox(page);
    await selectPageAndSelectAllMatching(page, "3");

    const floatingSelect = page.locator(".fixed.bottom-4 select").first();
    await expect(floatingSelect.locator('option[value="matched"]')).toHaveCount(0);
    await floatingSelect.selectOption("contacted");

    await expect.poll(() => bulkBody).not.toBeNull();
    expect(bulkBody!.stage).toBe("contacted");
    expect(bulkBody!.items).toHaveLength(3);
    for (const item of bulkBody!.items ?? []) {
      expect(item.expected_updated_at).toBeUndefined();
    }

    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Updated stage for 3" })).toBeVisible();
  });

  test("select-all → WhatsApp hydrates off-page id and bulk send posts ids only", async ({ page }) => {
    await mockAdminSession(page);
    let previewIds: string[] | null = null;
    let whatsappBody: Record<string, unknown> | null = null;
    await mockProviderOpsLeads(page, {
      ids: [LEAD_A, LEAD_B, LEAD_C],
      total: 3,
      onContactPreview: (body) => {
        const ids = (body as { ids?: string[] })?.ids;
        previewIds = ids ?? null;
      },
    });
    await mockWhatsAppApis(page, (body) => {
      whatsappBody = body as Record<string, unknown>;
    });

    await gotoLeadsInbox(page);
    await selectPageAndSelectAllMatching(page, "3");

    await page.locator(".fixed.bottom-4").getByRole("button", { name: /Send WhatsApp/i }).click();
    await expect(page.getByText("Bulk WhatsApp — Review")).toBeVisible();
    await expect.poll(() => previewIds).toEqual(expect.arrayContaining([LEAD_C]));
    await expect(page.getByRole("button", { name: /Continue \(1 eligible\)/ })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: /Continue \(1 eligible\)/ }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.locator("select").nth(0).locator("option", { hasText: "E2E Session" })).toHaveCount(1);
    await modal.locator("select").nth(0).selectOption("sess-e2e-1");
    await modal.locator("select").nth(1).selectOption("tpl-e2e-1");
    await page.getByRole("button", { name: "Review & Confirm" }).click();

    await modal.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Queue 1 Messages/i }).click();

    await expect.poll(() => whatsappBody).not.toBeNull();
    expect(whatsappBody!.lead_ids).toEqual([LEAD_A, LEAD_B, LEAD_C]);
    expect(Object.keys(whatsappBody!).sort()).toEqual(["lead_ids", "session_id", "template_id"].sort());
    expect(whatsappBody!.session_id).toBe("sess-e2e-1");
    expect(whatsappBody!.template_id).toBe("tpl-e2e-1");
  });

  test("select-all above 50 disables Send WhatsApp", async ({ page }) => {
    await mockAdminSession(page);
    const manyIds = Array.from(
      { length: 51 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i + 1).padStart(12, "0")}`,
    );
    await mockProviderOpsLeads(page, { ids: manyIds, total: 51 });

    await gotoLeadsInbox(page);
    await page.locator("table thead th").first().getByRole("button").click();
    await page.getByRole("button", { name: "Select all 51 matching filters" }).click();
    await expect(page.getByText(/bulk cap 500/)).toBeVisible();

    const bar = page.locator(".fixed.bottom-4");
    await expect(bar.getByRole("button", { name: /Send WhatsApp/i })).toBeDisabled();
    await expect(bar.locator("select").first()).toBeEnabled();
    await expect(bar.getByRole("button", { name: /Assign to/i })).toBeEnabled();
    await expect(bar.getByRole("button", { name: /Delete selected/i })).toBeEnabled();
  });

  test("finance AI queue caps bulk selection at 50", async ({ page }) => {
    await mockAdminSession(page);
    let bulkPostCount = 0;
    await mockFinanceAgentActions(page, 51, (body) => {
      bulkPostCount += 1;
      expect(body.ids).toHaveLength(50);
      expect(body.decision).toBe("approve");
    });

    await page.goto("/admin/finance/ai-queue", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Finance AI queue" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Payout recommendation").first()).toBeVisible({ timeout: 20_000 });

    const boxes = page.getByRole("checkbox", { name: "Select Payout recommendation" });
    for (let i = 0; i < 50; i++) {
      await boxes.nth(i).check();
    }
    await expect(page.getByText(/Bulk limit 50/)).toBeVisible();
    await expect(page.getByText(/payout reviews may stay pending/i)).toBeVisible();

    await boxes.nth(50).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /limited to 50/i })).toBeVisible();
    await expect(page.locator('input[type="checkbox"][aria-label="Select Payout recommendation"]:checked')).toHaveCount(
      50,
    );
    expect(bulkPostCount).toBe(0);

    const bulkBar = page.getByRole("status").filter({ hasText: "50 selected" });
    await bulkBar.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText(/second approver/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await bulkBar.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).last().click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /maker-checker/i })).toBeVisible({
      timeout: 15_000,
    });
    expect(bulkPostCount).toBe(1);
  });
});

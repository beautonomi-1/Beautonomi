import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("provider invoice billing migration + cron wiring", () => {
  it("includes migration 1015 with provider_billing_activity view", () => {
    const root = join(process.cwd(), "..", "..");
    const sql = readFileSync(
      join(root, "supabase", "migrations", "1015_provider_invoice_billing_completion.sql"),
      "utf8",
    );
    expect(sql).toContain("provider_billing_activity");
    expect(sql).toContain("update_invoice_amount_paid");
    expect(sql).toContain("overdue_notified_at");
  });

  it("registers invoice issue and overdue crons in vercel.json", () => {
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const config = JSON.parse(vercel) as { crons?: { path: string }[] };
    const paths = (config.crons ?? []).map((c) => c.path);
    expect(paths).toContain("/api/cron/issue-provider-invoices");
    expect(paths).toContain("/api/cron/mark-provider-invoices-overdue");
  });
});

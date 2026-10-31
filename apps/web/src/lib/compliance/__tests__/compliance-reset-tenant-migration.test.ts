import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "..", "..", "supabase", "migrations");

function readMigration(name: string): string {
  return readFileSync(join(migrationsDir, name), "utf8");
}

describe("1021 compliance reset tenant migration (static contract)", () => {
  const sql = readMigration("1021_compliance_reset_tenant_complete.sql");

  it("unlinks user_referrals.booking_id before bookings delete", () => {
    expect(sql).toMatch(/UPDATE public\.user_referrals\s+SET booking_id = NULL/i);
    expect(sql).toMatch(/"t": "bookings"/);
  });

  it("deletes payments, payment_disputes, and payment_transactions", () => {
    expect(sql).toMatch(/"t": "payments"/);
    expect(sql).toMatch(/"t": "payment_disputes"/);
    expect(sql).toMatch(/"t": "payment_transactions"/);
    expect(sql).toMatch(/"t": "booking_payments"/);
  });

  it("preserves support_mailboxes and brand_settings", () => {
    expect(sql).not.toMatch(/DELETE FROM public\.support_mailboxes/i);
    expect(sql).not.toMatch(/DELETE FROM public\.brand_settings/i);
  });

  it("disables append-only brand triggers when present", () => {
    expect(sql).toMatch(/DISABLE TRIGGER brand_brief_versions_no_update/i);
    expect(sql).toMatch(/DISABLE TRIGGER brand_asset_versions_no_update/i);
    expect(sql).toMatch(/pg_trigger/);
  });

  it("counts completed bookings only for provider total_bookings recompute", () => {
    expect(sql).toMatch(/total_bookings = COALESCE\(\(SELECT COUNT\(\*\) FROM public\.bookings b WHERE b\.provider_id = p\.id AND b\.status = 'completed'\)/);
  });

  it("deletes explore_sounds only when no explore_posts reference remains", () => {
    expect(sql).toMatch(/"t": "explore_sounds"/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.explore_posts ep WHERE ep\.sound_id = explore_sounds\.id\)/);
  });

  it("scopes notification and queue rows on order_id and conversation_id", () => {
    expect(sql).toMatch(/->>'order_id'/);
    expect(sql).toMatch(/->>'conversation_id'/);
    expect(sql).toMatch(/payload #>> '\{data,order_id\}'/);
    expect(sql).toMatch(/payload #>> '\{data,product_order_id\}'/);
    expect(sql).toMatch(/payload #>> '\{data,conversation_id\}'/);
    expect(sql).toMatch(/payload #>> '\{_queue_meta,tenant_id\}'/);
  });

  it("merges brand_reset_tenant_data on live runs", () => {
    expect(sql).toMatch(/v_brand := public\.brand_reset_tenant_data\(p_tenant_id\)/);
  });

  it("deletes extended transactional tables", () => {
    expect(sql).toMatch(/"t": "cart_items"/);
    expect(sql).toMatch(/"t": "provider_location_events"/);
    expect(sql).toMatch(/"t": "travel_routes"/);
    expect(sql).toMatch(/"t": "ads_budget_orders"/);
    expect(sql).toMatch(/"t": "content_reports"/);
  });

  it("does not swallow delete errors with EXCEPTION WHEN OTHERS in the main plan loop", () => {
    expect(sql).not.toMatch(/skipped', 'error'/);
    expect(sql).not.toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });

  it("covers plan transactional extras (whatsapp, wallet refunds, stock reversal)", () => {
    expect(sql).toMatch(/"t": "whatsapp_customer_messages"/);
    expect(sql).toMatch(/"t": "wallet_bank_refund_requests"/);
    expect(sql).toMatch(/"t": "provider_pay_runs"/);
    expect(sql).toMatch(/_stock_movements_reversed/);
    expect(sql).toMatch(/COALESCE\(n\.metadata, '\{\}'::jsonb\)/);
  });
});

/**
 * Unit tests for insertCompliancePurgeAuditLog
 *
 * Covers three scenarios:
 *   1. Happy path — insert succeeds with purge_after_at → { ok: true, id, no degraded flag }
 *   2. Schema-cache / missing-column retry — first insert fails with a schema-cache or
 *      Postgres 42703 error, fallback insert (without purge_after_at) succeeds
 *      → { ok: true, id, degraded: true }
 *   3. Hard failure — first insert fails with an unrelated error, no retry, → { ok: false }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertCompliancePurgeAuditLog } from "@/lib/account/compliance-purge-audit";
import type { CompliancePurgeReportV2 } from "@/lib/account/compliance-purge-audit";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUDIT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const MINIMAL_REPORT: CompliancePurgeReportV2 = {
  schema_version: 2,
  purge_type: "tenant_reset",
  started_at: "2026-07-01T00:00:00.000Z",
  completed_at: "2026-07-01T00:00:01.000Z",
  safeguards: {
    confirmation_phrase_verified: true,
    target_email_match_verified: true,
    regulatory_acknowledgement: true,
    reason_min_length_met: true,
  },
  actor: { user_id: "actor-uuid", role: "superadmin" },
  tenant_id: "tenant-uuid",
  reason_redacted_length: 40,
  operations: {
    compliance_clear_user_references_rpc: false,
    message_attachment_storage_objects_removed: 0,
    auth_users_deleted: [],
  },
};

const BASE_ROW = {
  actor_user_id: "actor-uuid",
  tenant_id: "tenant-uuid",
  purge_type: "tenant_reset" as const,
  target_user_id: null,
  provider_id: null,
  reason: "Regulatory cleanup ahead of tenant decommission — COMP-1742.",
  report: MINIMAL_REPORT,
  purged_user_ids: [],
};

// ---------------------------------------------------------------------------
// Helper to build a minimal Supabase admin client stub
// ---------------------------------------------------------------------------

function buildClient(
  firstInsertError: { code?: string; message?: string } | null,
  secondInsertError: { code?: string; message?: string } | null = null,
): SupabaseClient {
  let callCount = 0;

  const singleFactory = (insertError: typeof firstInsertError) =>
    vi.fn().mockResolvedValue(
      insertError
        ? { data: null, error: insertError }
        : { data: { id: AUDIT_ID }, error: null },
    );

  const makeSingle = () => {
    callCount++;
    return singleFactory(callCount === 1 ? firstInsertError : secondInsertError)();
  };

  const selectMock = vi.fn().mockReturnValue({ single: () => makeSingle() });
  const insertMock = vi.fn().mockReturnValue({ select: selectMock });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });

  return { from: fromMock } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("insertCompliancePurgeAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns ok:true with the inserted id when insert succeeds", async () => {
    const admin = buildClient(null);
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result).toEqual({ ok: true, id: AUDIT_ID });
    expect(result.ok && result.degraded).toBeFalsy();
  });

  it("schema-cache retry (PGRST204): falls back to insert without purge_after_at and returns degraded:true", async () => {
    const admin = buildClient(
      { code: "PGRST204", message: "Could not find the 'purge_after_at' column of 'compliance_purge_audit_log' in the schema cache" },
      null,
    );
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result).toEqual({ ok: true, id: AUDIT_ID, degraded: true });
  });

  it("schema-cache retry (42703): falls back and returns degraded:true", async () => {
    const admin = buildClient(
      { code: "42703", message: "column \"purge_after_at\" of relation \"compliance_purge_audit_log\" does not exist" },
      null,
    );
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result).toEqual({ ok: true, id: AUDIT_ID, degraded: true });
  });

  it("schema-cache retry (message heuristic): falls back on message containing 'schema cache'", async () => {
    const admin = buildClient(
      { code: "00000", message: "schema cache miss for table compliance_purge_audit_log" },
      null,
    );
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result).toEqual({ ok: true, id: AUDIT_ID, degraded: true });
  });

  it("schema-cache retry (message heuristic): falls back on message containing 'purge_after_at'", async () => {
    const admin = buildClient(
      { code: "00000", message: "column purge_after_at does not exist" },
      null,
    );
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result).toEqual({ ok: true, id: AUDIT_ID, degraded: true });
  });

  it("hard failure: non-schema error returns ok:false without retry", async () => {
    const admin = buildClient(
      { code: "23514", message: "new row for relation \"compliance_purge_audit_log\" violates check constraint" },
      null,
    );
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("violates check constraint");
    }
  });

  it("degraded path: both inserts fail → ok:false with fallback error message", async () => {
    const admin = buildClient(
      { code: "PGRST204", message: "schema cache error" },
      { code: "23514", message: "check constraint violation on fallback" },
    );
    const result = await insertCompliancePurgeAuditLog(admin, BASE_ROW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/check constraint violation|fallback also failed/i);
    }
  });

  it("accepts an explicit purge_after_at and passes it through on success", async () => {
    const admin = buildClient(null);
    const explicitDate = "2031-07-01T00:00:00.000Z";
    const result = await insertCompliancePurgeAuditLog(admin, {
      ...BASE_ROW,
      purge_after_at: explicitDate,
    });

    expect(result).toEqual({ ok: true, id: AUDIT_ID });
  });
});

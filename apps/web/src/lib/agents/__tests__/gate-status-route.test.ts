import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "../../../__tests__/helpers/mock-supabase";

const mockRequireAdminSection = vi.fn();
const mockLoadAgentModuleConfig = vi.fn();
const mockLoadAgentEmergencyControls = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  successResponse: (data: unknown) =>
    new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } }),
  handleApiError: (error: unknown, message = "Error") =>
    new Response(JSON.stringify({ error: { message: `${message}: ${String(error)}` } }), { status: 500 }),
}));
vi.mock("@/lib/admin-sections", () => ({ ADMIN_SECTION_PLATFORM_CONFIG: "platform_config" }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mockGetSupabaseAdmin() }));
vi.mock("@/lib/agents/config-loader", () => ({
  loadAgentModuleConfig: (...args: unknown[]) => mockLoadAgentModuleConfig(...args),
  loadAgentEmergencyControls: (...args: unknown[]) => mockLoadAgentEmergencyControls(...args),
}));

function supabaseWithTables(tables: Record<string, unknown[]>) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockResolvedValue({ data: tables[table] ?? [], error: null }),
    })),
  };
}

const AGENTS = [
  { id: "a1", key: "ops-sentinel", display_name: "Ops Sentinel", risk_ceiling: 0 },
  { id: "a2", key: "support-triage", display_name: "Support Triage", risk_ceiling: 1 },
];

describe("GET /api/admin/agents/gate-status", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockGetSupabaseAdmin.mockReturnValue(
      supabaseWithTables({
        agent_definitions: AGENTS,
        agent_operational_state: [{ agent_id: "a2", state: "active" }],
      }),
    );
    delete process.env.AGENT_RLS_HARNESS_GREEN;
    delete process.env.AGENT_P0_MIGRATIONS_VERIFIED;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function get(environment = "production") {
    const { GET } = await import("@/app/api/admin/agents/gate-status/route");
    const req = createMockNextRequest({
      url: `http://localhost:3000/api/admin/agents/gate-status?environment=${environment}`,
    });
    return GET(req as NextRequest);
  }

  it("reports every gate red with reasons and blockers on a fresh environment", async () => {
    mockLoadAgentModuleConfig.mockResolvedValue({ environment: "production", masterEnabled: false, shadowMode: true });
    mockLoadAgentEmergencyControls.mockResolvedValue({
      stopNewRuns: false,
      stopAllToolCalls: false,
      blockApprovedExecution: false,
      freezePendingProposals: false,
    });

    const res = await get();
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.environment).toBe("production");
    expect(data.mutations_allowed).toBe(false);
    expect(data.reads_allowed).toBe(false);
    const byKey = Object.fromEntries(data.gates.map((g: { key: string }) => [g.key, g]));
    expect(byKey.rls_harness_green.ok).toBe(false);
    expect(byKey.p0_migrations_verified.ok).toBe(false);
    expect(byKey.p0_migrations_verified.reason).toContain("787_gift_cards_rls_hardening.sql");
    expect(byKey.master_enabled.ok).toBe(false);
    expect(byKey.shadow_mode_off.ok).toBe(false);
    expect(byKey.emergency_controls_clear.ok).toBe(true);
    expect(data.blockers.length).toBeGreaterThanOrEqual(4);
    expect(data.blockers.some((b: string) => b.includes("master_enabled"))).toBe(true);

    expect(data.agents).toEqual([
      expect.objectContaining({ key: "ops-sentinel", state: "disabled" }),
      expect.objectContaining({ key: "support-triage", state: "active" }),
    ]);
    expect(data.active_agents).toBe(1);
    expect(mockLoadAgentModuleConfig).toHaveBeenCalledWith("production");
  });

  it("is green when env flags, master, shadow and emergency controls all pass", async () => {
    process.env.AGENT_RLS_HARNESS_GREEN = "true";
    process.env.AGENT_P0_MIGRATIONS_VERIFIED = "true";
    mockLoadAgentModuleConfig.mockResolvedValue({ environment: "staging", masterEnabled: true, shadowMode: false });
    mockLoadAgentEmergencyControls.mockResolvedValue({
      stopNewRuns: false,
      stopAllToolCalls: false,
      blockApprovedExecution: false,
      freezePendingProposals: false,
    });

    const res = await get("staging");
    const { data } = await res.json();
    expect(data.mutations_allowed).toBe(true);
    expect(data.blockers).toEqual([]);
    expect(data.gates.every((g: { ok: boolean }) => g.ok)).toBe(true);
    expect(mockLoadAgentModuleConfig).toHaveBeenCalledWith("staging");
  });

  it("surfaces active emergency controls as blockers even when the P0 gate passes", async () => {
    process.env.AGENT_RLS_HARNESS_GREEN = "true";
    process.env.AGENT_P0_MIGRATIONS_VERIFIED = "true";
    mockLoadAgentModuleConfig.mockResolvedValue({ environment: "production", masterEnabled: true, shadowMode: false });
    mockLoadAgentEmergencyControls.mockResolvedValue({
      stopNewRuns: true,
      stopAllToolCalls: false,
      blockApprovedExecution: true,
      freezePendingProposals: false,
    });

    const { data } = await (await get()).json();
    expect(data.mutations_allowed).toBe(false);
    const emergency = data.gates.find((g: { key: string }) => g.key === "emergency_controls_clear");
    expect(emergency.ok).toBe(false);
    expect(emergency.reason).toContain("stop_new_runs");
    expect(emergency.reason).toContain("block_approved_execution");
    expect(data.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining("block_approved_execution"), expect.stringContaining("stop_new_runs")]),
    );
  });

  it("rejects non-admin callers", async () => {
    mockRequireAdminSection.mockRejectedValue(new Error("forbidden"));
    const res = await get();
    expect(res.status).toBe(500);
  });
});

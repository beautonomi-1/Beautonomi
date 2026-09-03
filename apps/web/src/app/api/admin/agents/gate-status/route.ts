import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  loadAgentEmergencyControls,
  loadAgentModuleConfig,
} from "@/lib/agents/config-loader";
import { assertAgentMutationAllowed, describeAgentGates } from "@/lib/agents/safety-gate";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

/**
 * GET /api/admin/agents/gate-status?environment=production
 *
 * Preflight view for the Agentic Console: every execution gate as a boolean with
 * the reason it is red/green, the aggregated blocker list from
 * `assertAgentMutationAllowed`, and per-agent operational state.
 * Read-only; superadmin / platform-config section.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const [agentModule, emergency, agentsRes, statesRes] = await Promise.all([
      loadAgentModuleConfig(environment),
      loadAgentEmergencyControls(environment),
      supabase.from("agent_definitions").select("id, key, display_name, risk_ceiling"),
      supabase.from("agent_operational_state").select("agent_id, state"),
    ]);

    const rlsHarnessGreen = process.env.AGENT_RLS_HARNESS_GREEN === "true";
    const p0MigrationsVerified = process.env.AGENT_P0_MIGRATIONS_VERIFIED === "true";

    const gates = describeAgentGates({
      rlsHarnessGreen,
      p0MigrationsVerified,
      masterEnabled: agentModule.masterEnabled,
      shadowMode: agentModule.shadowMode,
      emergency: {
        stopNewRuns: emergency.stopNewRuns,
        stopAllToolCalls: emergency.stopAllToolCalls,
        blockApprovedExecution: emergency.blockApprovedExecution,
        freezePendingProposals: emergency.freezePendingProposals,
      },
    });

    const mutationGate = assertAgentMutationAllowed({
      rlsHarnessGreen,
      masterEnabled: agentModule.masterEnabled,
      shadowMode: agentModule.shadowMode,
      p0MigrationsVerified,
    });

    const stateByAgent = new Map(
      ((statesRes.data ?? []) as Array<{ agent_id: string; state: string }>).map((s) => [s.agent_id, s.state]),
    );
    const agents = ((agentsRes.data ?? []) as Array<{
      id: string;
      key: string;
      display_name: string;
      risk_ceiling: number;
    }>).map((a) => ({
      id: a.id,
      key: a.key,
      display_name: a.display_name,
      risk_ceiling: a.risk_ceiling,
      state: stateByAgent.get(a.id) ?? "disabled",
    }));

    const blockers = [...(mutationGate.blockers ?? [])];
    if (emergency.blockApprovedExecution) {
      blockers.push("Emergency control block_approved_execution is active");
    }
    if (emergency.stopNewRuns) {
      blockers.push("Emergency control stop_new_runs is active (no new agent runs will start)");
    }

    return successResponse({
      environment,
      reads_allowed: agentModule.masterEnabled,
      mutations_allowed: mutationGate.allowed && !emergency.blockApprovedExecution,
      blockers,
      gates,
      agents,
      active_agents: agents.filter((a) => a.state === "active").length,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to load agent gate status");
  }
}

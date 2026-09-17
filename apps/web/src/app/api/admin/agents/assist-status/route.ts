import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { loadAgentModuleConfig } from "@/lib/agents/config-loader";
import { assertAgentMutationAllowed } from "@/lib/agents/safety-gate";

/** Lightweight gate read for domain assist UI (any admin role). */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const environment =
      new URL(request.url).searchParams.get("environment") === "staging" ? "staging" : "production";
    const agentModule = await loadAgentModuleConfig(environment);
    const mutationGate = assertAgentMutationAllowed({
      rlsHarnessGreen: process.env.AGENT_RLS_HARNESS_GREEN === "true",
      masterEnabled: agentModule.masterEnabled,
      shadowMode: agentModule.shadowMode,
      p0MigrationsVerified: process.env.AGENT_P0_MIGRATIONS_VERIFIED === "true",
    });
    return successResponse({
      shadow_mode: agentModule.shadowMode,
      mutations_allowed: mutationGate.allowed,
      master_enabled: agentModule.masterEnabled,
      blockers: mutationGate.blockers ?? [],
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to load assist status");
  }
}

import type { AgentPrincipal } from "@beautonomi/agent-policy";
import type { AdminSection } from "@beautonomi/admin-access";
import { ADMIN_SECTION_ROLES } from "@beautonomi/admin-access";

export function buildAgentPrincipal(params: {
  actorId: string;
  agentKey: string;
  agentDefinitionVersion: string;
  tenantId: string;
  role: string;
  workflowType: string;
  workflowRunId: string;
  ttlMs?: number;
}): AgentPrincipal {
  const now = Date.now();
  const role = params.role as AgentPrincipal["role"];
  const allowedSectionsSnapshot = (Object.entries(ADMIN_SECTION_ROLES) as [AdminSection, string[]][])
    .filter(([, roles]) => roles.includes(role as any) || role === "superadmin")
    .map(([section]) => section);

  return {
    actorType: "agent",
    actorId: params.actorId,
    agentKey: params.agentKey,
    agentDefinitionVersion: params.agentDefinitionVersion,
    tenantId: params.tenantId,
    role: params.role,
    allowedSectionsSnapshot,
    workflowType: params.workflowType,
    workflowRunId: params.workflowRunId,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (params.ttlMs ?? 3600_000)).toISOString(),
  };
}

export function isPrincipalExpired(principal: AgentPrincipal): boolean {
  return new Date(principal.expiresAt) <= new Date();
}

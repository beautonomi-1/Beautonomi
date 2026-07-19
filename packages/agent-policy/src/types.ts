import type { AdminSection } from "@beautonomi/admin-access";

export type RiskTier = 0 | 1 | 2 | 3;
export type ToolMode = "read" | "propose" | "execute";

export type AgentActionStatus =
  | "draft"
  | "proposed"
  | "approval_pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "frozen"
  | "revoked"
  | "superseded"
  | "executing"
  | "executed"
  | "retryable_failure"
  | "permanent_failure"
  | "manual_intervention";

export type AgentPrincipal = {
  actorType: "agent";
  actorId: string;
  agentKey: string;
  agentDefinitionVersion: string;
  tenantId: string;
  role: string;
  /** Informational snapshot only — not authoritative for authz. */
  allowedSectionsSnapshot: AdminSection[];
  workflowType: string;
  workflowRunId: string;
  issuedAt: string;
  expiresAt: string;
};

export type AgentModuleConfig = {
  environment: string;
  masterEnabled: boolean;
  shadowMode: boolean;
  globalDailySpendCapUsd: number | null;
};

export type AgentOperationalState = {
  state: "active" | "paused" | "draining" | "disabled";
};

export type AgentEmergencyControls = {
  stopNewRuns: boolean;
  stopAllToolCalls: boolean;
  blockApprovedExecution: boolean;
  freezePendingProposals: boolean;
  allowReadonlyCompletion: boolean;
};

export type ToolGrant = {
  toolName: string;
  toolVersion: string;
  riskCeiling: RiskTier;
  maxRows: number;
  maxOutputBytes: number;
  active: boolean;
};

export type AuthzContext = {
  principal: AgentPrincipal;
  module: AgentModuleConfig;
  operational: AgentOperationalState;
  emergency: AgentEmergencyControls;
  toolGrant: ToolGrant | null;
  requiredSection: AdminSection;
  resolvedRiskTier: RiskTier;
  sectionRolesOverride?: Partial<Record<AdminSection, string[]>>;
  actorActive?: boolean;
  tenantValid?: boolean;
};

export type AuthzDenialReason =
  | "master_disabled"
  | "agent_not_active"
  | "emergency_stop"
  | "tenant_invalid"
  | "actor_inactive"
  | "section_denied"
  | "tool_not_granted"
  | "risk_ceiling_exceeded"
  | "shadow_blocks_mutation";

export type AuthzResult =
  | { allowed: true }
  | { allowed: false; reason: AuthzDenialReason; detail?: string };

export type AgentEvidence = {
  sourceToolCallId: string;
  recordType: string;
  recordId: string;
  recordVersion?: string;
  fieldNames: string[];
  observedAt: string;
  redactedSnapshotHash?: string;
};

export type AgentFinding = {
  statement: string;
  kind: "platform_fact" | "calculation" | "inference" | "recommendation";
  evidence: AgentEvidence[];
  qualification?: string;
};

export type StepRetentionClass = "A" | "B" | "C" | "D";

/**
 * Server-side approval policy matrix for agent actions.
 *
 * Requirements are defined here per action type — NEVER taken from the client
 * request. A reviewer cannot weaken the policy (e.g. lower required_count or
 * pick a friendlier role) because approve/reject routes look the policy up by
 * the action's own action_type.
 */
import type { AdminSection } from "@beautonomi/admin-access";
import type { UserRole } from "@/types/beautonomi";
import {
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_USERS_TRUST,
} from "@beautonomi/admin-access";

export type AgentApprovalPolicy = {
  /** Admin section required to view/approve/reject/execute this action type. */
  section: AdminSection;
  /** Roles whose approvals count toward required_count (defense in depth beyond the section gate). */
  approverRoles: UserRole[];
  /** Distinct human approvers required before the action becomes executable. */
  requiredCount: number;
  stage: number;
  /** Audit module label for approve/execute audit log rows. */
  auditModule: string;
};

const POLICIES: Record<string, AgentApprovalPolicy> = {
  // Money movement: true maker-checker — two distinct finance reviewers.
  "payout.review": {
    section: ADMIN_SECTION_FINANCE,
    approverRoles: ["superadmin", "admin_finance"],
    requiredCount: 2,
    stage: 1,
    auditModule: "finance",
  },
  // Annotation-only (writes a briefing into metadata) — single finance reviewer.
  "reconciliation.investigate": {
    section: ADMIN_SECTION_FINANCE,
    approverRoles: ["superadmin", "admin_finance"],
    requiredCount: 1,
    stage: 1,
    auditModule: "finance",
  },
  "refund.briefing": {
    section: ADMIN_SECTION_FINANCE,
    approverRoles: ["superadmin", "admin_finance"],
    requiredCount: 1,
    stage: 1,
    auditModule: "finance",
  },
  "fraud.briefing": {
    section: ADMIN_SECTION_USERS_TRUST,
    approverRoles: ["superadmin", "admin_trust"],
    requiredCount: 1,
    stage: 1,
    auditModule: "users_trust",
  },
  "dispute.briefing": {
    section: ADMIN_SECTION_USERS_TRUST,
    approverRoles: ["superadmin", "admin_trust"],
    requiredCount: 1,
    stage: 1,
    auditModule: "users_trust",
  },
  "report.briefing": {
    section: ADMIN_SECTION_USERS_TRUST,
    approverRoles: ["superadmin", "admin_trust"],
    requiredCount: 1,
    stage: 1,
    auditModule: "users_trust",
  },
  // Customer-facing reply drafted by the agent — a support human must approve before it is sent.
  "support.reply": {
    section: ADMIN_SECTION_SUPPORT,
    approverRoles: ["superadmin", "admin_support", "support_agent"],
    requiredCount: 1,
    stage: 1,
    auditModule: "support",
  },
  "support.assign": {
    section: ADMIN_SECTION_SUPPORT,
    approverRoles: ["superadmin", "admin_support", "support_agent"],
    requiredCount: 1,
    stage: 1,
    auditModule: "support",
  },
  "support.resolve": {
    section: ADMIN_SECTION_SUPPORT,
    approverRoles: ["superadmin", "admin_support", "support_agent"],
    requiredCount: 1,
    stage: 1,
    auditModule: "support",
  },
  // Provider-facing messages (health check-ins, onboarding nudges, listing tips, digests).
  "provider.outreach": {
    section: ADMIN_SECTION_PROVIDERS_OPERATIONS,
    approverRoles: ["superadmin", "admin_support", "admin_operations"],
    requiredCount: 1,
    stage: 1,
    auditModule: "providers_operations",
  },
  "catalog.review": {
    section: ADMIN_SECTION_PROVIDERS_OPERATIONS,
    approverRoles: ["superadmin", "admin_support", "admin_operations"],
    requiredCount: 1,
    stage: 1,
    auditModule: "providers_operations",
  },
  "provider.digest": {
    section: ADMIN_SECTION_PROVIDERS_OPERATIONS,
    approverRoles: ["superadmin", "admin_support", "admin_operations"],
    requiredCount: 1,
    stage: 1,
    auditModule: "providers_operations",
  },
  "membership.dunning": {
    section: ADMIN_SECTION_FINANCE,
    approverRoles: ["superadmin", "admin_finance"],
    requiredCount: 1,
    stage: 1,
    auditModule: "finance",
  },
  // Opens a fraud case (creates work for humans; cannot suspend or hide anything).
  "trust.open_case": {
    section: ADMIN_SECTION_USERS_TRUST,
    approverRoles: ["superadmin", "admin_trust"],
    requiredCount: 1,
    stage: 1,
    auditModule: "users_trust",
  },
};

export function getAgentApprovalPolicy(actionType: string): AgentApprovalPolicy | null {
  return POLICIES[actionType] ?? null;
}

export function listPolicedActionTypes(): string[] {
  return Object.keys(POLICIES);
}

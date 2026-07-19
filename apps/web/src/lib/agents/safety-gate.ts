/**
 * P0 safety gate — agent mutations blocked until RLS harness and hardening migrations pass.
 */
export type MutationGateResult = {
  allowed: boolean;
  reason?: string;
  blockers?: string[];
};

const REQUIRED_MIGRATIONS = [
  "787_gift_cards_rls_hardening.sql",
  "788_message_attachments_storage_hardening.sql",
];

export function assertAgentMutationAllowed(options?: {
  rlsHarnessGreen?: boolean;
  masterEnabled?: boolean;
  shadowMode?: boolean;
  /** Ops confirms P0 hardening migrations are applied (defaults to AGENT_P0_MIGRATIONS_VERIFIED env). */
  p0MigrationsVerified?: boolean;
}): MutationGateResult {
  const blockers: string[] = [];
  if (!options?.rlsHarnessGreen) {
    blockers.push("RLS harness must be green (run apps/web security tests + optional live integration)");
  }
  if (!options?.masterEnabled) {
    blockers.push("Agent module master_enabled is false");
  }
  if (options?.shadowMode !== false) {
    blockers.push("shadow_mode must be disabled for mutations");
  }
  const migrationsVerified =
    options?.p0MigrationsVerified ?? process.env.AGENT_P0_MIGRATIONS_VERIFIED === "true";
  if (!migrationsVerified) {
    for (const m of REQUIRED_MIGRATIONS) {
      blockers.push(`Verify migration applied: ${m} (then set AGENT_P0_MIGRATIONS_VERIFIED=true)`);
    }
  }
  if (blockers.length > 0) {
    return { allowed: false, reason: "P0 safety gate", blockers };
  }
  return { allowed: true };
}

/** Read-only agent operations may proceed when master is enabled. */
export function assertAgentReadAllowed(options: { masterEnabled: boolean }): MutationGateResult {
  if (!options.masterEnabled) {
    return { allowed: false, reason: "master_disabled", blockers: ["master_enabled is false"] };
  }
  return { allowed: true };
}

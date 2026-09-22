/**
 * Desk-scoped guards for Provider Ops API routes.
 * Managers (superadmin, admin_operations, admin_support) pass all desk checks.
 */
import type { NextRequest } from "next/server";
import type { OpsDesk } from "@/lib/provider-ops/ops-desk-roles";
import {
  requireOpsDesk,
  requireOpsManagers,
  requireProviderOpsSection,
} from "@/lib/provider-ops/ops-desk-auth";

export async function requireProviderOpsSales(request?: NextRequest | Request) {
  return requireOpsDesk(["sales"], request);
}

export async function requireProviderOpsOnboarding(request?: NextRequest | Request) {
  return requireOpsDesk(["onboarding"], request);
}

export async function requireProviderOpsRetention(request?: NextRequest | Request) {
  return requireOpsDesk(["retention"], request);
}

/** Dashboard, reports, my-day, assignable-users, handoffs. */
export async function requireProviderOpsAnyDesk(request?: NextRequest | Request) {
  return requireProviderOpsSection(request);
}

export async function requireProviderOpsManagersOnly(request?: NextRequest | Request) {
  return requireOpsManagers(request);
}

/** Routes used by sales + onboarding (e.g. shared read). */
export async function requireProviderOpsSalesOrOnboarding(request?: NextRequest | Request) {
  return requireOpsDesk(["sales", "onboarding"], request);
}

export type { OpsDesk };

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpsDesk } from "@/lib/provider-ops/ops-desk-roles";
import { deskForAdminRole, rolesForDesk } from "@/lib/provider-ops/ops-desk-roles";
import { loadProviderOpsSettings } from "@/lib/provider-ops/ops-settings";
import { roundRobinOpsOwner } from "@/lib/provider-ops/round-robin";
import type { UserRole } from "@/types/beautonomi";
import {
  WINBACK_TASK_TITLE,
  WINBACK_INVOLUNTARY_DUE_DAYS,
  WINBACK_VOLUNTARY_DUE_DAYS,
  addDaysIso,
  type ChurnReason,
} from "@/lib/provider-ops/retention-rules";
import { QUALIFYING_BOOKING_STATUSES } from "@/lib/provider-ops/retention-rules";

export type OpsCaseStatus = "open" | "lost" | "nurture" | "activated" | "churned";

export type EnsureProviderOpsCaseInput = {
  tenantId: string;
  leadId?: string | null;
  userId?: string | null;
  providerId?: string | null;
  currentDesk?: OpsDesk;
  status?: OpsCaseStatus;
  salesOwnerId?: string | null;
  onboardingOwnerId?: string | null;
  retentionOwnerId?: string | null;
  dealValue?: number | null;
  matchedAt?: string | null;
  wonAt?: string | null;
  activatedAt?: string | null;
  lostReason?: string | null;
  /** When true, may assign sales owner via round-robin if settings allow. */
  tryAutoAssign?: boolean;
  actorUserId?: string | null;
};

type CaseRow = {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  user_id: string | null;
  provider_id: string | null;
  current_desk: OpsDesk;
  status: OpsCaseStatus;
  sales_owner_id: string | null;
  onboarding_owner_id: string | null;
  retention_owner_id: string | null;
};

const OPEN_STATUSES: OpsCaseStatus[] = ["open", "activated"];

function ownerColumnForDesk(desk: OpsDesk): keyof CaseRow {
  if (desk === "sales") return "sales_owner_id";
  if (desk === "onboarding") return "onboarding_owner_id";
  return "retention_owner_id";
}

async function findOpenCase(
  supabase: SupabaseClient,
  input: Pick<EnsureProviderOpsCaseInput, "leadId" | "userId" | "providerId">,
): Promise<CaseRow | null> {
  if (input.leadId) {
    const { data } = await supabase
      .from("provider_ops_cases")
      .select("*")
      .eq("lead_id", input.leadId)
      .eq("status", "open")
      .maybeSingle();
    if (data) return data as CaseRow;
  }
  if (input.providerId) {
    const { data } = await supabase
      .from("provider_ops_cases")
      .select("*")
      .eq("provider_id", input.providerId)
      .in("status", OPEN_STATUSES)
      .maybeSingle();
    if (data) return data as CaseRow;
  }
  if (input.userId) {
    const { data } = await supabase
      .from("provider_ops_cases")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", OPEN_STATUSES)
      .maybeSingle();
    if (data) return data as CaseRow;
  }
  return null;
}

async function resolveAutoOwner(
  supabase: SupabaseClient,
  tenantId: string,
  desk: OpsDesk,
  explicit: string | null | undefined,
  tryAutoAssign: boolean,
): Promise<string | null> {
  if (explicit) return explicit;
  if (!tryAutoAssign) return null;
  const settings = await loadProviderOpsSettings(supabase, tenantId);
  if (!settings.auto_assign_enabled) return null;
  return roundRobinOpsOwner(supabase, tenantId, desk);
}

export async function ensureProviderOpsCase(
  supabase: SupabaseClient,
  input: EnsureProviderOpsCaseInput,
): Promise<{ caseId: string; created: boolean }> {
  const desk: OpsDesk = input.currentDesk ?? "sales";
  const status: OpsCaseStatus = input.status ?? "open";

  const existing = await findOpenCase(supabase, input);

  let salesOwner = input.salesOwnerId ?? null;
  let onboardingOwner = input.onboardingOwnerId ?? null;
  let retentionOwner = input.retentionOwnerId ?? null;

  if (desk === "sales" && salesOwner == null) {
    salesOwner = await resolveAutoOwner(
      supabase,
      input.tenantId,
      "sales",
      input.salesOwnerId,
      input.tryAutoAssign ?? true,
    );
  }
  if (desk === "onboarding" && onboardingOwner == null) {
    onboardingOwner = await resolveAutoOwner(
      supabase,
      input.tenantId,
      "onboarding",
      input.onboardingOwnerId,
      input.tryAutoAssign ?? true,
    );
  }
  if (desk === "retention" && retentionOwner == null) {
    retentionOwner = await resolveAutoOwner(
      supabase,
      input.tenantId,
      "retention",
      input.retentionOwnerId,
      input.tryAutoAssign ?? true,
    );
  }

  const patch: Record<string, unknown> = {
    tenant_id: input.tenantId,
    lead_id: input.leadId ?? null,
    user_id: input.userId ?? null,
    provider_id: input.providerId ?? null,
    current_desk: desk,
    status,
    deal_value: input.dealValue ?? null,
    lost_reason: input.lostReason ?? null,
  };

  if (input.matchedAt) patch.matched_at = input.matchedAt;
  if (input.wonAt) patch.won_at = input.wonAt;
  if (input.activatedAt) patch.activated_at = input.activatedAt;
  if (salesOwner) patch.sales_owner_id = salesOwner;
  if (onboardingOwner) patch.onboarding_owner_id = onboardingOwner;
  if (retentionOwner) patch.retention_owner_id = retentionOwner;

  if (existing) {
    const merged = {
      ...patch,
      lead_id: patch.lead_id ?? existing.lead_id,
      user_id: patch.user_id ?? existing.user_id,
      provider_id: patch.provider_id ?? existing.provider_id,
      sales_owner_id: patch.sales_owner_id ?? existing.sales_owner_id,
      onboarding_owner_id: patch.onboarding_owner_id ?? existing.onboarding_owner_id,
      retention_owner_id: patch.retention_owner_id ?? existing.retention_owner_id,
    };
    const { error } = await supabase.from("provider_ops_cases").update(merged).eq("id", existing.id);
    if (error) throw error;
    return { caseId: existing.id, created: false };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("provider_ops_cases")
    .insert({
      ...patch,
      sales_owner_id: salesOwner,
      onboarding_owner_id: onboardingOwner,
      retention_owner_id: retentionOwner,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;
  return { caseId: inserted.id as string, created: true };
}

export type TransitionCaseDeskInput = {
  tenantId: string;
  caseId: string;
  toDesk: OpsDesk;
  fromUserId?: string | null;
  toUserId?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  /** Skip creating a pending handoff when the same user owns both desks. */
  autoAcceptSameOwner?: boolean;
};

async function userEligibleForDesk(
  supabase: SupabaseClient,
  userId: string,
  desk: OpsDesk,
): Promise<boolean> {
  const { data: user } = await supabase
    .from("users")
    .select("role, deactivated_at")
    .eq("id", userId)
    .maybeSingle();
  if (!user || user.deactivated_at) return false;
  return rolesForDesk(desk).includes(user.role as UserRole);
}

export async function transitionCaseDesk(
  supabase: SupabaseClient,
  input: TransitionCaseDeskInput,
): Promise<{ handoffId: string | null; autoAccepted: boolean }> {
  const { data: caseRow, error: caseErr } = await supabase
    .from("provider_ops_cases")
    .select("*")
    .eq("id", input.caseId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (caseErr) throw caseErr;
  if (!caseRow) throw new Error("Provider ops case not found");

  const fromDesk = caseRow.current_desk as OpsDesk;
  if (fromDesk === input.toDesk) {
    return { handoffId: null, autoAccepted: false };
  }

  const fromCol = ownerColumnForDesk(fromDesk);
  const toCol = ownerColumnForDesk(input.toDesk);
  const fromOwner =
    input.fromUserId ??
    (caseRow[fromCol as keyof typeof caseRow] as string | null) ??
    null;

  let toOwner = input.toUserId ?? null;
  if (toOwner && !(await userEligibleForDesk(supabase, toOwner, input.toDesk))) {
    toOwner = null;
  }

  if (!toOwner && fromOwner && (input.autoAcceptSameOwner ?? true)) {
    if (await userEligibleForDesk(supabase, fromOwner, input.toDesk)) {
      toOwner = fromOwner;
    }
  }

  if (!toOwner) {
    toOwner = await resolveAutoOwner(supabase, input.tenantId, input.toDesk, null, true);
  }

  const handoffStatus =
    toOwner && toOwner === fromOwner ? "auto_accepted" : toOwner ? "accepted" : "pending";

  const { data: handoff, error: handoffErr } = await supabase
    .from("provider_ops_handoffs")
    .insert({
      tenant_id: input.tenantId,
      case_id: input.caseId,
      from_desk: fromDesk,
      to_desk: input.toDesk,
      from_user_id: fromOwner,
      to_user_id: toOwner,
      status: handoffStatus,
      note: input.note ?? null,
      created_by: input.actorUserId ?? null,
      accepted_at: handoffStatus !== "pending" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (handoffErr) throw handoffErr;

  const caseUpdate: Record<string, unknown> = {
    current_desk: input.toDesk,
  };
  if (toOwner) {
    caseUpdate[toCol] = toOwner;
  }

  const { error: updErr } = await supabase
    .from("provider_ops_cases")
    .update(caseUpdate)
    .eq("id", input.caseId);
  if (updErr) throw updErr;

  return {
    handoffId: handoff.id as string,
    autoAccepted: handoffStatus === "auto_accepted" || handoffStatus === "accepted",
  };
}

/** Resolve desk from a platform admin role (for nav / defaults). */
export function opsDeskFromRole(role: string | null | undefined): OpsDesk | null {
  return deskForAdminRole(role);
}

export async function stampFirstBookingAtIfNeeded(
  supabase: SupabaseClient,
  caseId: string,
  providerId: string,
): Promise<string | null> {
  const { data: caseRow } = await supabase
    .from("provider_ops_cases")
    .select("first_booking_at")
    .eq("id", caseId)
    .maybeSingle();
  if (caseRow?.first_booking_at) return caseRow.first_booking_at as string;

  const { data: booking } = await supabase
    .from("bookings")
    .select("created_at")
    .eq("provider_id", providerId)
    .in("status", [...QUALIFYING_BOOKING_STATUSES])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking?.created_at) return null;

  await supabase
    .from("provider_ops_cases")
    .update({ first_booking_at: booking.created_at })
    .eq("id", caseId);

  return booking.created_at as string;
}

export async function applyProviderSignupCaseHooks(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    providerId: string;
    leadId?: string | null;
    providerStatus?: string | null;
    salesOwnerId?: string | null;
    actorUserId?: string | null;
  },
): Promise<void> {
  const isActive = params.providerStatus === "active";
  let salesOwnerId = params.salesOwnerId ?? null;
  if (params.leadId && salesOwnerId == null) {
    const { data: leadRow } = await supabase
      .from("provider_leads")
      .select("assigned_to")
      .eq("id", params.leadId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    salesOwnerId = (leadRow?.assigned_to as string | null) ?? null;
  }

  const { caseId } = await ensureProviderOpsCase(supabase, {
    tenantId: params.tenantId,
    leadId: params.leadId ?? null,
    userId: params.userId,
    providerId: params.providerId,
    currentDesk: isActive ? "retention" : "onboarding",
    status: isActive ? "activated" : "open",
    salesOwnerId,
    matchedAt: params.leadId ? new Date().toISOString() : null,
    activatedAt: isActive ? new Date().toISOString() : null,
    tryAutoAssign: !isActive,
    actorUserId: params.actorUserId ?? null,
  });

  if (!isActive) {
    await transitionCaseDesk(supabase, {
      tenantId: params.tenantId,
      caseId,
      toDesk: "onboarding",
      fromUserId: salesOwnerId,
      actorUserId: params.actorUserId ?? null,
    });
  } else {
    await transitionCaseDesk(supabase, {
      tenantId: params.tenantId,
      caseId,
      toDesk: "retention",
      actorUserId: params.actorUserId ?? null,
    });
  }
}

export async function markCaseActivatedForProvider(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    providerId: string;
    userId: string;
    actorUserId?: string | null;
  },
): Promise<void> {
  const reopened = await reactivateChurnedCase(supabase, {
    tenantId: params.tenantId,
    providerId: params.providerId,
    source: "admin_activate",
  });
  if (reopened) return;

  const { data: provider } = await supabase
    .from("providers")
    .select("lead_id, user_id")
    .eq("id", params.providerId)
    .maybeSingle();

  const { data: existingCase } = await supabase
    .from("provider_ops_cases")
    .select("id, current_desk")
    .eq("tenant_id", params.tenantId)
    .eq("provider_id", params.providerId)
    .in("status", OPEN_STATUSES)
    .maybeSingle();

  const { caseId } = await ensureProviderOpsCase(supabase, {
    tenantId: params.tenantId,
    providerId: params.providerId,
    userId: params.userId,
    leadId: (provider?.lead_id as string | null) ?? null,
    currentDesk: "retention",
    status: "activated",
    activatedAt: new Date().toISOString(),
    tryAutoAssign: true,
    actorUserId: params.actorUserId ?? null,
  });

  const desk = (existingCase?.current_desk as OpsDesk | undefined) ?? null;
  if (desk === "retention") return;

  await transitionCaseDesk(supabase, {
    tenantId: params.tenantId,
    caseId,
    toDesk: "retention",
    actorUserId: params.actorUserId ?? null,
    note: "Provider activated",
  });
}

/** Copy round-robin sales owner from the open case onto the lead when still unassigned. */
export async function syncLeadOwnerFromSalesCase(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<string | null> {
  const { data: lead } = await supabase
    .from("provider_leads")
    .select("assigned_to")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (lead?.assigned_to) return lead.assigned_to as string;

  const { data: caseRow } = await supabase
    .from("provider_ops_cases")
    .select("sales_owner_id")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .in("status", ["open", "nurture"])
    .maybeSingle();

  const owner = (caseRow?.sales_owner_id as string | null) ?? null;
  if (owner) {
    await supabase.from("provider_leads").update({ assigned_to: owner }).eq("id", leadId);
  }
  return owner;
}

export async function syncCaseMilestonesForLeadStage(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
  newStage: string,
): Promise<void> {
  const { data: caseRow } = await supabase
    .from("provider_ops_cases")
    .select("id, first_contacted_at, won_at")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .in("status", ["open", "nurture", "activated"])
    .maybeSingle();
  if (!caseRow) return;

  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (newStage === "contacted" && !caseRow.first_contacted_at) {
    patch.first_contacted_at = now;
  }
  if (newStage === "won" && !caseRow.won_at) {
    patch.won_at = now;
  }
  if (Object.keys(patch).length === 0) return;

  await supabase.from("provider_ops_cases").update(patch).eq("id", caseRow.id);
}

/** Stamp first_contacted_at on the open case when the first outbound touch is logged. */
export async function stampFirstContactedAtForLead(
  supabase: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<void> {
  await syncCaseMilestonesForLeadStage(supabase, tenantId, leadId, "contacted");
}

export async function autoAssignOnboardingTrackingOwners(
  supabase: SupabaseClient,
  tenantId: string,
  userIds: string[],
  trackingByUser: Map<string, { assigned_to: string | null }>,
): Promise<number> {
  const settings = await loadProviderOpsSettings(supabase, tenantId);
  if (!settings.auto_assign_enabled) return 0;

  let assigned = 0;
  for (const userId of userIds) {
    if (trackingByUser.get(userId)?.assigned_to) continue;
    const adminId = await roundRobinOpsOwner(supabase, tenantId, "onboarding");
    if (!adminId) break;
    const { error } = await supabase.from("provider_onboarding_tracking").upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        assigned_to: adminId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (!error) {
      trackingByUser.set(userId, { assigned_to: adminId });
      assigned++;
    }
  }
  return assigned;
}

async function completeOpenWinBackTasks(
  supabase: SupabaseClient,
  tenantId: string,
  providerId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("provider_lead_tasks")
    .update({ completed_at: now })
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .eq("title", WINBACK_TASK_TITLE)
    .is("completed_at", null);
}

async function ensureWinBackTask(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    providerId: string;
    retentionOwnerId: string | null;
    churnReason: ChurnReason;
  },
): Promise<void> {
  const { data: existing } = await supabase
    .from("provider_lead_tasks")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("provider_id", params.providerId)
    .eq("title", WINBACK_TASK_TITLE)
    .is("completed_at", null)
    .maybeSingle();
  if (existing) return;

  const dueDays =
    params.churnReason === "cancelled_expired"
      ? WINBACK_VOLUNTARY_DUE_DAYS
      : WINBACK_INVOLUNTARY_DUE_DAYS;
  const dueAt = addDaysIso(Date.now(), dueDays);

  await supabase.from("provider_lead_tasks").insert({
    tenant_id: params.tenantId,
    provider_id: params.providerId,
    lead_id: null,
    title: WINBACK_TASK_TITLE,
    task_type: "winback",
    due_at: dueAt,
    assigned_to: params.retentionOwnerId,
  });
}

export async function reactivateChurnedCase(
  supabase: SupabaseClient,
  params: { tenantId: string; providerId: string; source?: "payment" | "admin_activate" },
): Promise<boolean> {
  const { data: rows } = await supabase
    .from("provider_ops_cases")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("provider_id", params.providerId)
    .eq("status", "churned");
  if (!rows?.length) return false;

  const followUp = addDaysIso(Date.now(), 7);
  const now = new Date().toISOString();
  const ids = rows.map((r) => r.id as string);

  await supabase
    .from("provider_ops_cases")
    .update({
      status: "activated",
      churn_reason: null,
      winback_step: 0,
      returned_at: now,
      next_follow_up_at: followUp,
      current_desk: "retention",
      updated_at: now,
    })
    .in("id", ids);

  await completeOpenWinBackTasks(supabase, params.tenantId, params.providerId);
  return true;
}

export async function markCaseChurned(
  supabase: SupabaseClient,
  tenantId: string,
  providerId: string,
  reason: ChurnReason,
): Promise<void> {
  const { data: caseRows } = await supabase
    .from("provider_ops_cases")
    .select("id, retention_owner_id")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .in("status", ["open", "activated"]);
  if (!caseRows?.length) return;

  const now = new Date().toISOString();
  const ids = caseRows.map((r) => r.id as string);
  const retentionOwner =
    (caseRows.find((r) => r.retention_owner_id)?.retention_owner_id as string | null) ?? null;

  await supabase
    .from("provider_ops_cases")
    .update({
      status: "churned",
      current_desk: "retention",
      churn_reason: reason,
      winback_step: 0,
      updated_at: now,
    })
    .in("id", ids);

  await ensureWinBackTask(supabase, {
    tenantId,
    providerId,
    retentionOwnerId: retentionOwner,
    churnReason: reason,
  });
}

export type RecordAtRiskSaveResult =
  | { ok: true; atRiskSavedAt: string; alreadyRecorded?: boolean }
  | { error: "not_found" }
  | { error: "invalid_state"; message: string }
  | { error: "not_at_risk" };

/** Manual at-risk save removed; saves are recorded by the daily reconcile after touch + recovery. */
export async function recordAtRiskSaveForCase(
  _supabase: SupabaseClient,
  _params: { tenantId: string; caseId: string; actorUserId: string },
): Promise<RecordAtRiskSaveResult> {
  return {
    error: "invalid_state",
    message:
      "At-risk saves are recorded automatically when booking volume recovers after outreach. Log a touch instead.",
  };
}

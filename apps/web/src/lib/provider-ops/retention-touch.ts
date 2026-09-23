import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WINBACK_TASK_TITLE,
  WINBACK_PARK_DAYS,
  WINBACK_SNOOZE_INVOLUNTARY_DAYS,
  WINBACK_SNOOZE_VOLUNTARY_DAYS,
  addDaysIso,
  isInvoluntaryChurn,
  type ChurnReason,
} from "@/lib/provider-ops/retention-rules";
import { defaultSnoozeDaysForStage, retentionStage } from "@/lib/provider-ops/retention-stage";

export type TouchChannel = "call" | "whatsapp" | "email" | "note";

export async function logRetentionCaseTouch(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    caseId: string;
    actorUserId: string;
    channel: TouchChannel;
    note?: string | null;
    followUpAt?: string | null;
  },
): Promise<{ followUpAt: string | null }> {
  const { data: caseRow } = await supabase
    .from("provider_ops_cases")
    .select("*")
    .eq("id", params.caseId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (!caseRow) throw new Error("Case not found");

  await supabase.from("provider_ops_case_touches").insert({
    tenant_id: params.tenantId,
    case_id: params.caseId,
    provider_id: caseRow.provider_id,
    actor_user_id: params.actorUserId,
    channel: params.channel,
    note: params.note?.trim() || null,
  });

  let followUpAt = params.followUpAt ?? null;
  const nowMs = Date.now();

  if (caseRow.status === "churned") {
    const step = Number(caseRow.winback_step ?? 0);
    const reason = caseRow.churn_reason as ChurnReason | null;
    if (step === 0) {
      const snoozeDays = isInvoluntaryChurn(reason)
        ? WINBACK_SNOOZE_INVOLUNTARY_DAYS
        : WINBACK_SNOOZE_VOLUNTARY_DAYS;
      followUpAt = addDaysIso(nowMs, snoozeDays);
      await supabase
        .from("provider_ops_cases")
        .update({ winback_step: 1, next_follow_up_at: followUpAt, updated_at: new Date().toISOString() })
        .eq("id", params.caseId);
      if (caseRow.provider_id) {
        await supabase
          .from("provider_lead_tasks")
          .update({ due_at: followUpAt })
          .eq("tenant_id", params.tenantId)
          .eq("provider_id", caseRow.provider_id)
          .eq("title", WINBACK_TASK_TITLE)
          .is("completed_at", null);
      }
    } else if (step === 1) {
      followUpAt = addDaysIso(nowMs, WINBACK_PARK_DAYS);
      await supabase
        .from("provider_ops_cases")
        .update({ winback_step: 2, next_follow_up_at: followUpAt, updated_at: new Date().toISOString() })
        .eq("id", params.caseId);
      if (caseRow.provider_id) {
        const done = new Date().toISOString();
        await supabase
          .from("provider_lead_tasks")
          .update({ completed_at: done })
          .eq("tenant_id", params.tenantId)
          .eq("provider_id", caseRow.provider_id)
          .eq("title", WINBACK_TASK_TITLE)
          .is("completed_at", null);
      }
    }
  } else {
    if (!followUpAt) {
      const { stage } = retentionStage({
        status: String(caseRow.status),
        activated_at: caseRow.activated_at as string | null,
        first_booking_at: caseRow.first_booking_at as string | null,
        last_qualifying_booking_at: caseRow.last_qualifying_booking_at as string | null,
        qualifying_booking_count: caseRow.qualifying_booking_count as number | null,
        returned_at: caseRow.returned_at as string | null,
      });
      followUpAt = addDaysIso(nowMs, defaultSnoozeDaysForStage(stage));
    }
    await supabase
      .from("provider_ops_cases")
      .update({ next_follow_up_at: followUpAt, updated_at: new Date().toISOString() })
      .eq("id", params.caseId);
  }

  if (!caseRow.retention_owner_id) {
    await supabase
      .from("provider_ops_cases")
      .update({ retention_owner_id: params.actorUserId })
      .eq("id", params.caseId);
  }

  return { followUpAt };
}

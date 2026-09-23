/**
 * Logic E2E: retention desk pipeline from raw case rows → enrich → tab/working filters.
 * Does not hit DB or HTTP; validates wired behavior matches product rules.
 */
import { describe, expect, it } from "vitest";
import {
  enrichRetentionCaseRow,
  filterByTab,
  sortWorkingList,
} from "@/lib/provider-ops/retention-enrich";
import { logRetentionCaseTouch } from "@/lib/provider-ops/retention-touch";
import { WINBACK_TASK_TITLE } from "@/lib/provider-ops/retention-rules";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();

function daysAgo(n: number): string {
  return new Date(NOW - n * 86400000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(NOW + n * 86400000).toISOString();
}

describe("retention desk logic E2E pipeline", () => {
  it("activation day 8 appears on working; day 3 does not", () => {
    const stalled = enrichRetentionCaseRow(
      {
        id: "c1",
        status: "activated",
        activated_at: daysAgo(8),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      null,
      NOW,
    );
    expect(stalled.on_working_list).toBe(true);

    const ok = enrichRetentionCaseRow(
      {
        id: "c2",
        status: "activated",
        activated_at: daysAgo(3),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      null,
      NOW,
    );
    expect(ok.on_working_list).toBe(false);
  });

  it("healthy provider with future snooze is off working; due snooze is priority 1", () => {
    const snoozed = enrichRetentionCaseRow(
      {
        id: "c3",
        status: "activated",
        activated_at: daysAgo(90),
        first_booking_at: daysAgo(80),
        last_qualifying_booking_at: daysAgo(5),
        qualifying_booking_count: 10,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: daysFromNow(5),
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      daysAgo(1),
      NOW,
    );
    expect(snoozed.stage).toBe("healthy");
    expect(snoozed.on_working_list).toBe(false);

    const due = enrichRetentionCaseRow(
      {
        id: "c3",
        status: "activated",
        activated_at: daysAgo(90),
        first_booking_at: daysAgo(80),
        last_qualifying_booking_at: daysAgo(5),
        qualifying_booking_count: 10,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: daysAgo(1),
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      daysAgo(1),
      NOW,
    );
    expect(due.on_working_list).toBe(true);
    expect(due.working_priority).toBe(1);
  });

  it("activation SLA is snoozed off working when follow-up is in the future", () => {
    const row = enrichRetentionCaseRow(
      {
        id: "c3b",
        status: "activated",
        activated_at: daysAgo(8),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: daysFromNow(5),
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      daysAgo(1),
      NOW,
    );
    expect(row.stage).toBe("activation_7d");
    expect(row.on_working_list).toBe(false);
  });

  it("churned provider is snoozed off working until follow-up is due", () => {
    const snoozed = enrichRetentionCaseRow(
      {
        id: "ch1",
        status: "churned",
        activated_at: daysAgo(30),
        first_booking_at: daysAgo(20),
        last_qualifying_booking_at: daysAgo(20),
        qualifying_booking_count: 2,
        returned_at: null,
        churn_reason: "dunning_exhausted",
        next_follow_up_at: daysFromNow(3),
        at_risk_flagged_at: null,
        winback_step: 1,
      },
      daysAgo(1),
      NOW,
    );
    expect(snoozed.on_working_list).toBe(false);

    const due = enrichRetentionCaseRow(
      {
        id: "ch1",
        status: "churned",
        activated_at: daysAgo(30),
        first_booking_at: daysAgo(20),
        last_qualifying_booking_at: daysAgo(20),
        qualifying_booking_count: 2,
        returned_at: null,
        churn_reason: "dunning_exhausted",
        next_follow_up_at: daysAgo(1),
        at_risk_flagged_at: null,
        winback_step: 1,
      },
      daysAgo(1),
      NOW,
    );
    expect(due.on_working_list).toBe(true);
    expect(due.working_priority).toBe(1);
  });

  it("inactive tab filters cooling vs one-and-done", () => {
    const oneAndDone = enrichRetentionCaseRow(
      {
        id: "c4",
        status: "activated",
        activated_at: daysAgo(60),
        first_booking_at: daysAgo(20),
        last_qualifying_booking_at: daysAgo(20),
        qualifying_booking_count: 1,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      null,
      NOW,
    );
    expect(filterByTab(oneAndDone, "one_and_done")).toBe(true);
    expect(filterByTab(oneAndDone, "inactive")).toBe(false);

    const cooling = enrichRetentionCaseRow(
      {
        id: "c5",
        status: "activated",
        activated_at: daysAgo(90),
        first_booking_at: daysAgo(50),
        last_qualifying_booking_at: daysAgo(20),
        qualifying_booking_count: 5,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      null,
      NOW,
    );
    expect(filterByTab(cooling, "inactive")).toBe(true);
  });

  it("working scope sort orders higher priority first", () => {
    const a = enrichRetentionCaseRow(
      {
        id: "a",
        status: "activated",
        activated_at: daysAgo(30),
        first_booking_at: daysAgo(20),
        last_qualifying_booking_at: daysAgo(20),
        qualifying_booking_count: 1,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      null,
      NOW,
    );
    const b = enrichRetentionCaseRow(
      {
        id: "b",
        status: "activated",
        activated_at: daysAgo(8),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
      },
      null,
      NOW,
    );
    const sorted = [a, b].sort(sortWorkingList);
    expect(sorted[0].id).toBe("a");
    expect(a.working_priority).toBeLessThan(b.working_priority as number);
  });

  it("churned win-back touch advances step and sets follow-up (mocked supabase)", async () => {
    const updates: Record<string, unknown>[] = [];
    const taskUpdates: Record<string, unknown>[] = [];
    const caseRow = {
      id: "case-churn",
      provider_id: "prov-1",
      status: "churned",
      churn_reason: "dunning_exhausted",
      winback_step: 0,
      activated_at: null,
      first_booking_at: null,
      last_qualifying_booking_at: null,
      qualifying_booking_count: 0,
      returned_at: null,
      retention_owner_id: null,
    };

    const supabase = {
      from(table: string) {
        if (table === "provider_ops_cases") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: caseRow }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                updates.push(payload);
                return { error: null };
              },
            }),
          };
        }
        if (table === "provider_ops_case_touches") {
          return {
            insert: async () => ({ error: null }),
          };
        }
        if (table === "provider_lead_tasks") {
          return {
            update: (payload: Record<string, unknown>) => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    is: async () => {
                      taskUpdates.push(payload);
                      return { error: null };
                    },
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await logRetentionCaseTouch(supabase as never, {
      tenantId: "t1",
      caseId: "case-churn",
      actorUserId: "user-1",
      channel: "call",
      note: "Left voicemail",
    });

    expect(result.followUpAt).toBeTruthy();
    expect(updates.some((u) => u.winback_step === 1)).toBe(true);
    expect(taskUpdates.some((u) => u.due_at === result.followUpAt)).toBe(true);
    expect(WINBACK_TASK_TITLE).toBe("Win-back");
  });
});

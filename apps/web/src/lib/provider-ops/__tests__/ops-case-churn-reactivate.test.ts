import { describe, expect, it } from "vitest";
import { markCaseChurned, reactivateChurnedCase } from "@/lib/provider-ops/ops-case";
import { WINBACK_TASK_TITLE } from "@/lib/provider-ops/retention-rules";

function thenableQuery<T>(data: T) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.is = chain;
  builder.not = chain;
  builder.limit = chain;
  builder.maybeSingle = () => Promise.resolve({ data, error: null });
  builder.then = (
    onFulfilled: (v: { data: T; error: null }) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  return builder;
}

describe("markCaseChurned / reactivateChurnedCase", () => {
  it("marks open cases churned and inserts one win-back task", async () => {
    const caseUpdates: Record<string, unknown>[] = [];
    const taskInserts: Record<string, unknown>[] = [];

    const supabase = {
      from(table: string) {
        if (table === "provider_ops_cases") {
          return {
            select: () =>
              thenableQuery([{ id: "c1", retention_owner_id: "owner-1" }]),
            update: (payload: Record<string, unknown>) => ({
              in: async () => {
                caseUpdates.push(payload);
                return { error: null };
              },
            }),
          };
        }
        if (table === "provider_lead_tasks") {
          return {
            select: () => thenableQuery(null),
            insert: async (row: Record<string, unknown>) => {
              taskInserts.push(row);
              return { error: null };
            },
            update: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    is: async () => ({ error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    await markCaseChurned(supabase as never, "tenant-1", "prov-1", "dunning_exhausted");

    expect(caseUpdates[0]?.status).toBe("churned");
    expect(caseUpdates[0]?.churn_reason).toBe("dunning_exhausted");
    expect(taskInserts).toHaveLength(1);
    expect(taskInserts[0]?.title).toBe(WINBACK_TASK_TITLE);
    expect(taskInserts[0]?.provider_id).toBe("prov-1");
  });

  it("reactivates churned case and completes win-back tasks", async () => {
    const caseUpdates: Record<string, unknown>[] = [];
    let tasksCompleted = false;

    const supabase = {
      from(table: string) {
        if (table === "provider_ops_cases") {
          return {
            select: () => thenableQuery([{ id: "c1" }]),
            update: (payload: Record<string, unknown>) => ({
              in: async () => {
                caseUpdates.push(payload);
                return { error: null };
              },
            }),
          };
        }
        if (table === "provider_lead_tasks") {
          return {
            update: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    is: async () => {
                      tasksCompleted = true;
                      return { error: null };
                    },
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    const ok = await reactivateChurnedCase(supabase as never, {
      tenantId: "tenant-1",
      providerId: "prov-1",
      source: "payment",
    });

    expect(ok).toBe(true);
    expect(caseUpdates[0]?.status).toBe("activated");
    expect(caseUpdates[0]?.returned_at).toBeTruthy();
    expect(tasksCompleted).toBe(true);
  });
});

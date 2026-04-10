import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type SubRow = Record<string, unknown> & {
  id?: string;
  plan_id?: string;
  status?: string;
  billing_period?: string;
  providers?: { business_name?: string } | null;
  subscription_plans?: { name?: string } | null;
};

type PlanOption = { id: string; name: string };

export function ProviderSubscriptionsPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const qk = useMemo(() => `status=${status}`, [status]);

  const q = useQuery({
    queryKey: adminQueryKeys.providerSubscriptions(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      const qs = p.toString();
      return adminApi.getJson<SubRow[]>(`/api/admin/provider-subscriptions${qs ? `?${qs}` : ""}`, {
        timeoutMs: 60_000,
      });
    },
    enabled: allowed,
  });

  const plansQ = useQuery({
    queryKey: adminQueryKeys.plans(),
    queryFn: () => adminApi.getJson<Record<string, unknown>[]>("/api/admin/plans", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const planOptions: PlanOption[] = useMemo(() => {
    const list = Array.isArray(plansQ.data) ? plansQ.data : [];
    return list
      .map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? p.id ?? ""),
      }))
      .filter((p) => p.id.length > 0);
  }, [plansQ.data]);

  const changePlan = useMutation({
    mutationFn: ({ subId, planId }: { subId: string; planId: string }) =>
      adminApi.patchJson<unknown>(`/api/admin/provider-subscriptions/${subId}`, { plan_id: planId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providerSubscriptions(qk) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
    },
  });

  const changeStatus = useMutation({
    mutationFn: ({ subId, newStatus }: { subId: string; newStatus: string }) =>
      adminApi.patchJson<unknown>(`/api/admin/provider-subscriptions/${subId}`, { status: newStatus }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providerSubscriptions(qk) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
    },
  });

  /** Draft plan_id per subscription row until user clicks Apply */
  const [planDraft, setPlanDraft] = useState<Record<string, string>>({});

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider subscriptions" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Provider subscriptions"
        description="Lists provider SaaS subscriptions. Changing the plan updates the database immediately; Paystack may need a separate alignment for customers on card billing."
      />
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Status{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              n.set("status", e.target.value);
              setSp(n, { replace: true });
            }}
          >
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="trial">trial</option>
            <option value="expired">expired</option>
            <option value="cancelled">cancelled</option>
            <option value="past_due">past_due</option>
          </select>
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No subscriptions" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Plan</AdminTh>
              <AdminTh>Change plan</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Period</AdminTh>
              <AdminTh>Manage</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const sid = String(r.id ?? "");
              const currentPlanId = r.plan_id != null ? String(r.plan_id) : "";
              const opts = (() => {
                const o = [...planOptions];
                if (currentPlanId && !o.some((x) => x.id === currentPlanId)) {
                  o.unshift({
                    id: currentPlanId,
                    name: String(r.subscription_plans?.name ?? currentPlanId),
                  });
                }
                return o;
              })();
              const selected = planDraft[sid] ?? currentPlanId;
              return (
                <tr key={sid}>
                  <AdminTd>{String(r.providers?.business_name ?? "")}</AdminTd>
                  <AdminTd>{String(r.subscription_plans?.name ?? "")}</AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="max-w-[14rem] rounded border border-gray-300 px-2 py-1 text-sm"
                        value={selected}
                        disabled={changePlan.isPending || opts.length === 0}
                        onChange={(e) => setPlanDraft((d) => ({ ...d, [sid]: e.target.value }))}
                      >
                        {opts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-900 disabled:opacity-50"
                        disabled={
                          changePlan.isPending || !selected || selected === currentPlanId || opts.length === 0
                        }
                        onClick={() => {
                          if (
                            !confirm(
                              "Change this provider to the selected subscription plan? This updates the database; Paystack may still need manual alignment for billed customers.",
                            )
                          ) {
                            return;
                          }
                          changePlan.mutate(
                            { subId: sid, planId: selected },
                            {
                              onSuccess: () => {
                                setPlanDraft((d) => {
                                  const n = { ...d };
                                  delete n[sid];
                                  return n;
                                });
                              },
                            },
                          );
                        }}
                      >
                        Apply
                      </button>
                      {plansQ.isLoading ? <span className="text-xs text-gray-500">Loading plans…</span> : null}
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "active" ? "bg-green-100 text-green-800" :
                      r.status === "past_due" ? "bg-amber-100 text-amber-800" :
                      r.status === "expired" ? "bg-red-100 text-red-800" :
                      r.status === "cancelled" ? "bg-gray-100 text-gray-600" :
                      r.status === "trial" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {String(r.status ?? "")}
                    </span>
                  </AdminTd>
                  <AdminTd>{String(r.billing_period ?? "")}</AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {(r.status === "expired" || r.status === "past_due" || r.status === "cancelled") && (
                        <button
                          type="button"
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          disabled={changeStatus.isPending}
                          onClick={() => {
                            if (confirm(`Reactivate subscription for ${r.providers?.business_name ?? "this provider"}?`)) {
                              changeStatus.mutate({ subId: sid, newStatus: "active" });
                            }
                          }}
                        >
                          Reactivate
                        </button>
                      )}
                      {r.status === "active" && (
                        <button
                          type="button"
                          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                          disabled={changeStatus.isPending}
                          onClick={() => {
                            if (confirm(`Cancel subscription for ${r.providers?.business_name ?? "this provider"}?`)) {
                              changeStatus.mutate({ subId: sid, newStatus: "cancelled" });
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

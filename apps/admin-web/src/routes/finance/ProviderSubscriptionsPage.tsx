import { useMemo, useState } from "react";
import { adminToast } from "@/lib/adminToast";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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
import {
  AdminSubscriptionActionModal,
  type AdminSubscriptionActionPayload,
} from "@/components/admin/AdminSubscriptionActionModal";

type SubRow = Record<string, unknown> & {
  id?: string;
  plan_id?: string;
  status?: string;
  billing_period?: string;
  expires_at?: string | null;
  providers?: { business_name?: string } | null;
  subscription_plans?: { name?: string; is_free?: boolean } | null;
};

type PlanOption = { id: string; name: string; is_free?: boolean };
type PlansPayload = Record<string, unknown>[] | { plans?: Record<string, unknown>[] };

export function ProviderSubscriptionsPage() {
  useAdminDocumentTitle("Provider Subscriptions");
  const qc = useQueryClient();
  const { allowed, denied } = useSuperadminPage(
    "Provider subscriptions are restricted to platform superadmins (matches Next.js /admin/provider-subscriptions).",
  );
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const qk = useMemo(() => `status=${status}`, [status]);
  const [pendingAction, setPendingAction] = useState<AdminSubscriptionActionPayload | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.providerSubscriptions(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      const qs = p.toString();
      return adminApi.getJson<SubRow[] | { subscriptions?: SubRow[] }>(
        `/api/admin/provider-subscriptions${qs ? `?${qs}` : ""}`,
        {
          timeoutMs: 60_000,
        },
      );
    },
    enabled: allowed,
    staleTime: 0,
  });

  const plansQ = useQuery({
    queryKey: adminQueryKeys.plans(),
    queryFn: () => adminApi.getJson<PlansPayload>("/api/admin/plans", { timeoutMs: 60_000 }),
    enabled: allowed,
    staleTime: 0,
  });

  const planOptions: PlanOption[] = useMemo(() => {
    const list = Array.isArray(plansQ.data) ? plansQ.data : plansQ.data?.plans ?? [];
    return list
      .map((p) => ({
        id: String(p.id ?? ""),
        name: String(p.name ?? p.id ?? ""),
        is_free: p.is_free === true,
      }))
      .filter((p) => p.id.length > 0);
  }, [plansQ.data]);

  const patchSubscription = useMutation({
    mutationFn: (body: { subId: string; patch: Record<string, unknown> }) =>
      adminApi.patchJson<unknown>(`/api/admin/provider-subscriptions/${body.subId}`, body.patch),
    onSuccess: async () => {
      adminToast.success("Subscription updated");
      setPendingAction(null);
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providerSubscriptions(qk) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update subscription"),
  });

  /** Draft plan_id per subscription row until user clicks Assign plan */
  const [planDraft, setPlanDraft] = useState<Record<string, string>>({});

  const rows = Array.isArray(q.data) ? q.data : ((q.data as { subscriptions?: SubRow[] })?.subscriptions ?? []);

  function handleModalConfirm(payload: AdminSubscriptionActionPayload) {
    if (payload.kind === "assign_plan") {
      const planId = planDraft[payload.subId];
      if (!planId) return;
      patchSubscription.mutate(
        {
          subId: payload.subId,
          patch: { plan_id: planId, status: "active" },
        },
        {
          onSuccess: () => {
            setPlanDraft((d) => {
              const n = { ...d };
              delete n[payload.subId];
              return n;
            });
          },
        },
      );
      return;
    }
    if (payload.kind === "reactivate") {
      patchSubscription.mutate({ subId: payload.subId, patch: { status: "active" } });
      return;
    }
    if (payload.kind === "cancel") {
      patchSubscription.mutate({ subId: payload.subId, patch: { status: "cancelled" } });
    }
  }

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
        description="Assign plans, reactivate, or cancel paid billing. Free tiers use platform defaults — suspend the provider account to block access."
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
              const currentPlanIsFree = r.subscription_plans?.is_free === true;
              const providerName = String(r.providers?.business_name ?? "this provider");
              const currentPlanName = String(r.subscription_plans?.name ?? "");
              const currentStatus = String(r.status ?? "");
              const opts = (() => {
                const o = [...planOptions];
                if (currentPlanId && !o.some((x) => x.id === currentPlanId)) {
                  o.unshift({
                    id: currentPlanId,
                    name: currentPlanName || currentPlanId,
                    is_free: currentPlanIsFree,
                  });
                }
                return o;
              })();
              const selected = planDraft[sid] ?? currentPlanId;
              const selectedPlan = opts.find((p) => p.id === selected);
              const isCancelledLike =
                currentStatus === "expired" ||
                currentStatus === "past_due" ||
                currentStatus === "cancelled";

              return (
                <tr key={sid}>
                  <AdminTd>{providerName}</AdminTd>
                  <AdminTd>{currentPlanName}</AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="max-w-[14rem] rounded border border-gray-300 px-2 py-1 text-sm"
                        value={selected}
                        disabled={patchSubscription.isPending || opts.length === 0}
                        onChange={(e) => setPlanDraft((d) => ({ ...d, [sid]: e.target.value }))}
                      >
                        {opts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.is_free ? " (free)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-900 disabled:opacity-50"
                        disabled={
                          patchSubscription.isPending ||
                          !selected ||
                          selected === currentPlanId ||
                          opts.length === 0
                        }
                        onClick={() => {
                          setPendingAction({
                            kind: "assign_plan",
                            subId: sid,
                            providerName,
                            currentPlanName,
                            currentStatus,
                            targetPlanName: selectedPlan?.name ?? selected,
                            targetPlanIsFree: selectedPlan?.is_free,
                            currentPlanIsFree,
                          });
                        }}
                      >
                        Assign plan
                      </button>
                      {plansQ.isLoading ? <span className="text-xs text-gray-500">Loading plans…</span> : null}
                    </div>
                    {isCancelledLike ? (
                      <p className="mt-1 text-xs text-gray-500">Assign or Reactivate to restore the billing record.</p>
                    ) : null}
                  </AdminTd>
                  <AdminTd>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "active"
                          ? "bg-green-100 text-green-800"
                          : r.status === "past_due"
                            ? "bg-amber-100 text-amber-800"
                            : r.status === "expired"
                              ? "bg-red-100 text-red-800"
                              : r.status === "cancelled"
                                ? "bg-gray-100 text-gray-600"
                                : r.status === "trial"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {currentStatus}
                    </span>
                  </AdminTd>
                  <AdminTd>{String(r.billing_period ?? "")}</AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {isCancelledLike && (
                        <button
                          type="button"
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          disabled={patchSubscription.isPending}
                          onClick={() => {
                            setPendingAction({
                              kind: "reactivate",
                              subId: sid,
                              providerName,
                              currentPlanName,
                              currentStatus,
                              currentPlanIsFree,
                            });
                          }}
                        >
                          Reactivate
                        </button>
                      )}
                      {currentStatus === "active" && !currentPlanIsFree && (
                        <button
                          type="button"
                          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                          disabled={patchSubscription.isPending}
                          onClick={() => {
                            setPendingAction({
                              kind: "cancel",
                              subId: sid,
                              providerName,
                              currentPlanName,
                              currentStatus,
                              currentPlanIsFree,
                              expiresAt:
                                typeof r.expires_at === "string" ? r.expires_at : null,
                            });
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {currentStatus === "active" && currentPlanIsFree ? (
                        <span className="text-xs text-gray-500 self-center px-1">Free — suspend provider to block access</span>
                      ) : null}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      <AdminSubscriptionActionModal
        open={pendingAction != null}
        payload={pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={handleModalConfirm}
        isPending={patchSubscription.isPending}
      />
    </div>
  );
}

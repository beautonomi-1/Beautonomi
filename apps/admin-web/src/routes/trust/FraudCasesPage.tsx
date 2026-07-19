import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
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
import { adminToast } from "@/lib/adminToast";

type FraudCasesPayload = {
  data: Record<string, unknown>[];
  has_more: boolean;
  total: number;
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  review: "bg-blue-100 text-blue-800",
  held: "bg-red-100 text-red-800",
  released: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
};

function riskBadgeClass(score: number | null | undefined): string {
  const n = Number(score ?? 0);
  if (n >= 70) return "bg-red-100 text-red-800";
  if (n >= 40) return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

type ActionType = "review" | "hold" | "release" | "close";

export function FraudCasesPage() {
  useAdminDocumentTitle("Fraud Cases");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_USERS_TRUST,
    "Users & trust access is required.",
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const qk = useMemo(() => adminQueryKeys.fraudCases(`s=${status}|o=${offset}`), [status, offset]);

  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", "50");
      p.set("offset", String(offset));
      if (status !== "all") p.set("status", status);
      return adminApi.getJson<FraudCasesPayload>(`/api/admin/fraud-cases?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const updateCase = useMutation({
    mutationFn: async ({
      id,
      newStatus,
      notes,
    }: {
      id: string;
      newStatus: string;
      notes: string;
    }) => {
      return adminApi.patchJson(`/api/admin/fraud-cases/${id}`, {
        status: newStatus,
        decision: notes.trim() || undefined,
      });
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: qk });
      setActionId(null);
      setActionType(null);
      setDecisionNotes("");
      adminToast.success(`Case marked ${vars.newStatus}`);
    },
    onError: (e: Error) => adminToast.error(`Failed to update case: ${e.message}`),
  });

  const rows = q.data?.data ?? [];
  const hasMore = q.data?.has_more ?? false;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.delete("offset");
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Fraud cases" />
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

  const tabs = ["all", "open", "review", "held", "released", "closed"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Fraud cases"
        description="Review signals from payments, identity checks, and user reports. Hold or release after human review — payout holds are applied separately in Finance."
      />
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setStatus(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No fraud cases" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Signal</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Risk</AdminTh>
              <AdminTh>Subject</AdminTh>
              <AdminTh>Payment</AdminTh>
              <AdminTh>Opened</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              const statusStr = String(row.status ?? "open");
              const badgeClass = STATUS_BADGE[statusStr] ?? "bg-gray-100 text-gray-600";
              const riskScore = row.risk_score != null ? Number(row.risk_score) : null;
              const subjectUser = row.subject_user as { full_name?: string; email?: string } | null;
              const subjectProvider = row.subject_provider as { business_name?: string } | null;
              const isExpanded = expandedId === id;
              const signals = (row.signals ?? {}) as Record<string, unknown>;
              const agentBriefing = signals.agent_briefing as
                | string
                | { summary?: string; recommendation?: string }
                | undefined;
              const agentRecommendation = signals.agent_recommendation as string | undefined;
              const canAct = !["closed", "released"].includes(statusStr);

              return (
                <Fragment key={id}>
                  <tr
                    className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? "bg-gray-50" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <AdminTd className="font-mono text-xs">{String(row.signal_kind ?? "—")}</AdminTd>
                    <AdminTd>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                        {statusStr}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      {riskScore != null ? (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass(riskScore)}`}
                        >
                          {riskScore}
                        </span>
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                    <AdminTd className="text-xs">
                      {subjectProvider?.business_name ??
                        subjectUser?.full_name ??
                        subjectUser?.email ??
                        "—"}
                    </AdminTd>
                    <AdminTd className="font-mono text-xs text-gray-500">
                      {row.payment_reference ? String(row.payment_reference).slice(0, 16) : "—"}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500 whitespace-nowrap">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : ""}
                    </AdminTd>
                    <AdminTd>
                      {canAct && (
                        <div className="flex flex-wrap gap-1">
                          {statusStr === "open" && (
                            <button
                              type="button"
                              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionId(id);
                                setActionType("review");
                                setDecisionNotes("");
                              }}
                            >
                              Review
                            </button>
                          )}
                          {(statusStr === "open" || statusStr === "review") && (
                            <button
                              type="button"
                              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionId(id);
                                setActionType("hold");
                                setDecisionNotes("");
                              }}
                            >
                              Hold
                            </button>
                          )}
                          {statusStr === "held" && (
                            <button
                              type="button"
                              className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionId(id);
                                setActionType("release");
                                setDecisionNotes("");
                              }}
                            >
                              Release
                            </button>
                          )}
                          {statusStr !== "closed" && (
                            <button
                              type="button"
                              className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionId(id);
                                setActionType("close");
                                setDecisionNotes("");
                              }}
                            >
                              Close
                            </button>
                          )}
                        </div>
                      )}
                    </AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr key={`${id}-detail`}>
                      <td colSpan={7} className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="grid gap-4 text-sm md:grid-cols-2">
                          <div>
                            <p className="mb-1 font-medium text-gray-700">Signals</p>
                            <pre className="max-h-48 overflow-auto rounded bg-white p-2 text-xs text-gray-600">
                              {JSON.stringify(signals, null, 2)}
                            </pre>
                          </div>
                          <div>
                            {agentBriefing ? (
                              <div className="mb-3">
                                <p className="mb-1 font-medium text-gray-700">Agent briefing</p>
                                <p className="text-xs text-gray-600">
                                  {typeof agentBriefing === "string"
                                    ? agentBriefing
                                    : String(agentBriefing.summary ?? "")}
                                </p>
                                {agentRecommendation ? (
                                  <p className="mt-1 text-xs text-amber-700">
                                    Recommendation: {agentRecommendation}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {Boolean(row.decision) ? (
                              <div>
                                <p className="mb-1 font-medium text-gray-700">Decision notes</p>
                                <p className="text-xs text-gray-600">{String(row.decision)}</p>
                              </div>
                            ) : null}
                            {Boolean(signals.recommend_hold) && (
                              <p className="mt-2 text-xs text-amber-700">
                                Payout hold recommended — apply via Finance → Payouts or Paystack Terminal
                                operations if needed.
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            onClick={() => {
              const n = new URLSearchParams(sp);
              n.set("offset", String(offset + 50));
              setSp(n, { replace: true });
            }}
          >
            Load more
          </button>
        </div>
      )}

      {actionId && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">
              {actionType === "review" && "Mark under review"}
              {actionType === "hold" && "Hold case"}
              {actionType === "release" && "Release case"}
              {actionType === "close" && "Close case"}
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              {actionType === "hold"
                ? "Records a hold decision and notifies the subject that their account is under review. Apply payout holds separately in Finance if needed."
                : actionType === "release"
                  ? "Clears the hold and notifies the subject that review is complete."
                  : "Add decision notes for the audit trail."}
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Decision notes{" "}
              {actionType === "release" || actionType === "close" ? "(required)" : "(optional)"}
            </label>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Notes for Trust team and audit log..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                onClick={() => {
                  setActionId(null);
                  setActionType(null);
                  setDecisionNotes("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
                disabled={updateCase.isPending}
                onClick={() => {
                  const statusMap: Record<ActionType, string> = {
                    review: "review",
                    hold: "held",
                    release: "released",
                    close: "closed",
                  };
                  updateCase.mutate({
                    id: actionId,
                    newStatus: statusMap[actionType],
                    notes: decisionNotes,
                  });
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

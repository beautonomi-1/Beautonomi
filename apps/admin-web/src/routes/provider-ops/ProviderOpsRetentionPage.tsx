import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS, ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import type { BroadcastAudiencePreset } from "@/routes/marketing/BroadcastComposePage";

const TABS = [
  { id: "active", label: "Working" },
  { id: "all", label: "All active" },
  { id: "no_booking", label: "No first booking" },
  { id: "one_and_done", label: "One and done" },
  { id: "inactive", label: "Inactive" },
  { id: "at_risk", label: "At risk" },
  { id: "churned", label: "Churned" },
] as const;

type RetentionTab = (typeof TABS)[number]["id"];

interface RetentionCaseRow {
  id: string;
  provider_id: string | null;
  status: string;
  stage?: string;
  activation_badge?: string | null;
  inactive_badge?: string | null;
  churn_reason?: string | null;
  winback_step?: number;
  first_booking_at: string | null;
  qualifying_booking_count?: number | null;
  days_since_activation?: number | null;
  days_since_last_booking?: number | null;
  last_touch_at?: string | null;
  next_follow_up_at?: string | null;
  at_risk_flagged_at?: string | null;
  providers?: { id: string; business_name: string | null; status: string | null; user_id?: string | null } | null;
  booking_trend?: { previous30d: number; recent30d: number; concerning: boolean };
  weekly_bookings_falling?: boolean;
}

interface RetentionPayload {
  tab: string;
  scope?: string;
  cases: RetentionCaseRow[];
}

function parseTab(raw: string | null): RetentionTab {
  const found = TABS.find((t) => t.id === raw);
  return found?.id ?? "active";
}

function retentionQueryKey(tab: RetentionTab, scope: string) {
  return adminQueryKeys.providerOps.retention(`${tab}|${scope}`);
}

function buildRetentionUrl(tab: RetentionTab): string {
  if (tab === "active") return "/api/admin/provider-ops/retention?tab=active&scope=working";
  if (tab === "all") return "/api/admin/provider-ops/retention?tab=active&scope=all";
  return `/api/admin/provider-ops/retention?tab=${tab}`;
}

export function ProviderOpsRetentionPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const { canAccess } = useAdminSession();
  const canBroadcast = canAccess(ADMIN_SECTION_MARKETING_COMMS);
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = parseTab(sp.get("tab"));
  const scope = tab === "all" ? "all" : tab === "active" ? "working" : "all";
  const qc = useQueryClient();

  const [touchCaseId, setTouchCaseId] = useState<string | null>(null);
  const [touchChannel, setTouchChannel] = useState<"call" | "whatsapp" | "email" | "note">("call");
  const [touchNote, setTouchNote] = useState("");
  const [taskCaseId, setTaskCaseId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: retentionQueryKey(tab, scope),
    queryFn: () => adminApi.getJson<RetentionPayload>(buildRetentionUrl(tab)),
    enabled: allowed,
  });

  const logTouch = useMutation({
    mutationFn: (caseId: string) =>
      adminApi.postJson(`/api/admin/provider-ops/cases/${caseId}/touches`, {
        channel: touchChannel,
        note: touchNote.trim() || undefined,
      }),
    onSuccess: () => {
      adminToast.success("Touch logged");
      setTouchCaseId(null);
      setTouchNote("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Could not log touch"),
  });

  const createTask = useMutation({
    mutationFn: (caseId: string) =>
      adminApi.postJson<{ id: string }>(`/api/admin/provider-ops/cases/${caseId}/tasks`, {
        title: taskTitle.trim(),
        due_at: taskDueAt.trim() || undefined,
      }),
    onSuccess: () => {
      adminToast.success("Task created");
      setTaskCaseId(null);
      setTaskTitle("");
      setTaskDueAt("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Could not create task"),
  });

  const setTab = (next: RetentionTab) => {
    const n = new URLSearchParams(sp);
    if (next === "active") n.delete("tab");
    else n.set("tab", next);
    setSelectedIds(new Set());
    setSp(n, { replace: true });
  };

  const broadcastWholeTab = async (opts?: { churn_reason?: string; label?: string }) => {
    try {
      const params = new URLSearchParams();
      const apiTab =
        tab === "all" || tab === "active" || tab === "at_risk" ? null : tab;
      if (!apiTab && !opts?.churn_reason) {
        adminToast.error("Select a broadcast cohort tab first");
        return;
      }
      if (apiTab) params.set("tab", apiTab);
      if (opts?.churn_reason) {
        params.set("tab", "churned");
        params.set("churn_reason", opts.churn_reason);
      }
      const res = await adminApi.getJson<{
        user_ids: string[];
        provider_count: number;
        cap_hit: boolean;
      }>(`/api/admin/provider-ops/retention/broadcast-audience?${params.toString()}`);
      if (!res.user_ids.length) {
        adminToast.error("No providers in this cohort (after touch/snooze filters)");
        return;
      }
      const label =
        opts?.label ??
        (tab === "no_booking"
          ? "Retention — no first booking (14d+)"
          : tab === "one_and_done"
            ? "Retention — one and done"
            : tab === "inactive"
              ? "Retention — inactive"
              : "Retention cohort");
      const audience: BroadcastAudiencePreset = {
        user_ids: res.user_ids,
        app_type: "provider",
        label: res.cap_hit ? `${label} (capped at ${res.provider_count})` : label,
      };
      navigate(adminSpaTo("/admin/broadcast/compose"), { state: { audience } });
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Could not build audience");
    }
  };

  const broadcastSelected = async () => {
    if (selectedIds.size === 0) {
      adminToast.error("Select at least one provider");
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("case_ids", [...selectedIds].join(","));
      const res = await adminApi.getJson<{ user_ids: string[]; provider_count: number }>(
        `/api/admin/provider-ops/retention/broadcast-audience?${params.toString()}`,
      );
      if (!res.user_ids.length) {
        adminToast.error("No sendable providers in selection");
        return;
      }
      navigate(adminSpaTo("/admin/broadcast/compose"), {
        state: {
          audience: {
            user_ids: res.user_ids,
            app_type: "provider",
            label: `Retention — selected (${res.provider_count})`,
          } satisfies BroadcastAudiencePreset,
        },
      });
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Could not build audience");
    }
  };

  const tabDescription = useMemo(() => {
    switch (tab) {
      case "active":
        return "Providers due for a human touch today (follow-ups, SLAs, at-risk flags, due win-backs)";
      case "all":
        return "All open and activated providers on the retention desk";
      case "no_booking":
        return "Activated but no qualifying booking yet";
      case "one_and_done":
        return "One qualifying booking, none since 14+ days";
      case "inactive":
        return "Cooling, dormant, and deep dormant (14–60+ days quiet)";
      case "at_risk":
        return "Booking volume down ≥50% vs prior 30 days (min 5 prior bookings), or flagged";
      case "churned":
        return "Paid subscription ended — win-back queue";
      default:
        return "";
    }
  }, [tab]);

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Retention queue" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data;
  if (!data) return <AdminRetryBlock message="No data" onRetry={() => void q.refetch()} />;

  const tabMeta = TABS.find((t) => t.id === tab);
  const showRowSelect = tab === "at_risk" || tab === "active" || tab === "all";

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Retention queue" description={tabDescription} />

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        {canBroadcast ? (
          <span className="ml-auto flex flex-wrap gap-2">
            {(tab === "no_booking" || tab === "one_and_done" || tab === "inactive") && (
              <button
                type="button"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                onClick={() => void broadcastWholeTab()}
              >
                Draft broadcast (tab)
              </button>
            )}
            {tab === "churned" && (
              <>
                <button
                  type="button"
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  onClick={() =>
                    void broadcastWholeTab({
                      churn_reason: "involuntary",
                      label: "Retention — churn involuntary",
                    })
                  }
                >
                  Draft — involuntary churn
                </button>
                <button
                  type="button"
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  onClick={() =>
                    void broadcastWholeTab({
                      churn_reason: "cancelled_expired",
                      label: "Retention — cancelled at period end",
                    })
                  }
                >
                  Draft — cancelled expired
                </button>
              </>
            )}
            {showRowSelect && selectedIds.size > 0 && (
              <button
                type="button"
                className="rounded-md bg-indigo-700 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-800"
                onClick={() => void broadcastSelected()}
              >
                Draft broadcast ({selectedIds.size})
              </button>
            )}
          </span>
        ) : null}
      </div>

      <AdminPanel title={tabMeta?.label ?? "Cases"}>
        {data.cases.length === 0 ? (
          <p className="text-sm text-gray-500">No cases in this queue.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  {showRowSelect && canBroadcast ? (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedIds.has(c.id)}
                      onChange={(e) => {
                        const n = new Set(selectedIds);
                        if (e.target.checked) n.add(c.id);
                        else n.delete(c.id);
                        setSelectedIds(n);
                      }}
                    />
                  ) : null}
                  <div className="min-w-0">
                    {c.provider_id ? (
                      <Link
                        to={adminSpaTo(`/admin/provider-ops/providers/${c.provider_id}`)}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {c.providers?.business_name || c.provider_id}
                      </Link>
                    ) : (
                      <span>{c.id}</span>
                    )}
                    <p className="mt-0.5 text-gray-500">
                      {c.status}
                      {c.stage ? ` · ${String(c.stage).replace(/_/g, " ")}` : null}
                      {c.activation_badge ? ` · SLA ${c.activation_badge}` : null}
                      {c.inactive_badge ? ` · ${c.inactive_badge} quiet` : null}
                      {c.churn_reason ? ` · ${c.churn_reason.replace(/_/g, " ")}` : null}
                      {c.qualifying_booking_count != null ? ` · ${c.qualifying_booking_count} bookings` : null}
                      {c.days_since_last_booking != null
                        ? ` · last ${c.days_since_last_booking}d ago`
                        : c.days_since_activation != null
                          ? ` · live ${c.days_since_activation}d`
                          : null}
                      {tab === "at_risk" && c.booking_trend ? (
                        <>
                          {" "}
                          · {c.booking_trend.previous30d} → {c.booking_trend.recent30d} (30d)
                        </>
                      ) : null}
                      {c.weekly_bookings_falling ? " · weekly bookings falling" : null}
                    </p>
                    {c.last_touch_at || c.next_follow_up_at ? (
                      <p className="text-xs text-gray-400">
                        {c.last_touch_at ? `Last touch ${new Date(c.last_touch_at).toLocaleDateString()}` : null}
                        {c.next_follow_up_at
                          ? ` · Follow-up ${new Date(c.next_follow_up_at).toLocaleDateString()}`
                          : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <button
                    type="button"
                    className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800"
                    onClick={() => {
                      setTouchCaseId(c.id);
                      setTouchChannel("call");
                      setTouchNote("");
                    }}
                  >
                    Log touch
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      setTaskCaseId(c.id);
                      setTaskTitle("Follow up");
                      setTaskDueAt("");
                    }}
                  >
                    Add task
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      {taskCaseId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-900">Add retention task</h3>
            <div className="mt-3 space-y-3">
              <input
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Task title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              <input
                type="datetime-local"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                onClick={() => setTaskCaseId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={createTask.isPending || !taskTitle.trim()}
                onClick={() => createTask.mutate(taskCaseId)}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {touchCaseId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-gray-900">Log touch</h3>
            <div className="mt-3 space-y-3">
              <select
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={touchChannel}
                onChange={(e) => setTouchChannel(e.target.value as typeof touchChannel)}
              >
                <option value="call">Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="note">Note</option>
              </select>
              <textarea
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                rows={3}
                placeholder="Optional note"
                value={touchNote}
                onChange={(e) => setTouchNote(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                onClick={() => setTouchCaseId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={logTouch.isPending}
                onClick={() => logTouch.mutate(touchCaseId)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminToolbarButtonClass } from "@/lib/adminUi";

const PIPELINE_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "dismissed", label: "Dismissed" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-indigo-100 text-indigo-800",
  quoted: "bg-purple-100 text-purple-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-gray-100 text-gray-600",
  dismissed: "bg-gray-100 text-gray-500",
};

export type TerminalInsightItem = {
  id: string;
  provider_id: string;
  terminal_ownership_status: string | null;
  terminal_provider: string | null;
  interested_in_platform_terminal: string | null;
  source: string | null;
  updated_at: string;
  plan_name: string | null;
  plan_includes_terminal: boolean;
  is_upsell_opportunity: boolean;
  upsell_lead: {
    id: string;
    status: string;
    assigned_to: string | null;
    notes: string | null;
    updated_at: string;
    assigned_user?: { id: string; full_name: string | null; email: string | null } | null;
  } | null;
  providers: {
    id: string;
    business_name: string;
    slug: string | null;
    status: string | null;
  };
};

type Activity = {
  id: string;
  activity_type: string;
  description: string | null;
  created_at: string;
  performer?: { full_name?: string | null; email?: string | null } | null;
};

export function TerminalUpsellPanel({
  item,
  onClose,
}: {
  item: TerminalInsightItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const leadId = item.upsell_lead?.id ?? null;

  const { data: assignees } = useQuery({
    queryKey: adminQueryKeys.commercialAssignableUsers,
    queryFn: () =>
      adminApi.getJson<{ users: Array<{ id: string; full_name: string | null; email: string | null }> }>(
        "/api/admin/commercial/assignable-users",
      ),
  });

  const { data: activitiesData, refetch: refetchActivities } = useQuery({
    queryKey: [...adminQueryKeys.commercialTerminalUpsellLead, leadId, "activities"],
    queryFn: () =>
      adminApi.getJson<{ activities: Activity[] }>(
        `/api/admin/commercial/terminal-upsell-leads/${leadId}/activities`,
      ),
    enabled: Boolean(leadId),
  });

  const createLeadMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/commercial/terminal-upsell-leads", {
        provider_id: item.provider_id,
        source: "manual",
      }),
    onSuccess: () => {
      adminToast.success("Upsell lead started");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalInsights });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to start lead"),
  });

  const updateLeadMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (!leadId) throw new Error("No upsell lead");
      return adminApi.patchJson(`/api/admin/commercial/terminal-upsell-leads/${leadId}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalInsights });
      void refetchActivities();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update lead"),
  });

  const activities = activitiesData?.activities ?? [];
  const assigneeList = assignees?.users ?? [];

  return (
    <AdminPanel className="sticky top-4">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Terminal upsell</p>
          <h3 className="text-lg font-semibold text-gray-900">{item.providers.business_name}</h3>
          {item.is_upsell_opportunity ? (
            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Upsell opportunity
            </span>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Ownership</p>
            <p className="font-medium capitalize">{item.terminal_ownership_status?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Interest</p>
            <p className="font-medium capitalize">{item.interested_in_platform_terminal ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Plan</p>
            <p className="font-medium">{item.plan_name ?? "No active plan"}</p>
            {item.plan_includes_terminal ? (
              <span className="text-xs text-green-700">Terminal included</span>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-gray-500">Pipeline</p>
            {item.upsell_lead ? (
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.upsell_lead.status] ?? "bg-gray-100 text-gray-700"}`}>
                {item.upsell_lead.status}
              </span>
            ) : (
              <p className="font-medium text-gray-500">Not started</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to={`/admin/providers/${item.provider_id}?tab=commercial`}
            className={adminToolbarButtonClass()}
          >
            Provider commercial
          </Link>
          <Link
            to="/admin/commercial/terminal-campaigns"
            className={adminToolbarButtonClass()}
          >
            Campaigns
          </Link>
        </div>

        {!leadId ? (
          <button
            type="button"
            disabled={createLeadMut.isPending}
            onClick={() => createLeadMut.mutate()}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {createLeadMut.isPending ? "Starting…" : "Start upsell pipeline"}
          </button>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Pipeline status</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={item.upsell_lead?.status ?? "new"}
                onChange={(e) => updateLeadMut.mutate({ status: e.target.value })}
                disabled={updateLeadMut.isPending}
              >
                {PIPELINE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Owner</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={item.upsell_lead?.assigned_to ?? ""}
                onChange={(e) =>
                  updateLeadMut.mutate({ assigned_to: e.target.value || null })
                }
                disabled={updateLeadMut.isPending}
              >
                <option value="">Unassigned</option>
                {assigneeList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email || u.id}
                  </option>
                ))}
              </select>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const note = String(fd.get("note") ?? "").trim();
                if (!note) return;
                updateLeadMut.mutate({ note });
                e.currentTarget.reset();
              }}
            >
              <label className="mb-1 block text-xs font-medium text-gray-700">Add note</label>
              <textarea
                name="note"
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Call outcome, quote details…"
              />
              <button
                type="submit"
                disabled={updateLeadMut.isPending}
                className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Save note
              </button>
            </form>

            {activities.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Activity</p>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {activities.map((act) => (
                    <li key={act.id} className="rounded-lg bg-gray-50 px-3 py-2">
                      <p className="text-gray-800">{act.description ?? act.activity_type}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(act.created_at).toLocaleString()}
                        {act.performer?.full_name || act.performer?.email
                          ? ` · ${act.performer.full_name || act.performer.email}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AdminPanel>
  );
}

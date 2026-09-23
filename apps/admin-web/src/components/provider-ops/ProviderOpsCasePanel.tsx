import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminToast } from "@/lib/adminToast";

type CaseRow = {
  id: string;
  current_desk: string;
  status: string;
  sales_owner_id: string | null;
  onboarding_owner_id: string | null;
  retention_owner_id: string | null;
  first_contacted_at: string | null;
  won_at: string | null;
  activated_at: string | null;
  first_booking_at: string | null;
  last_qualifying_booking_at?: string | null;
  qualifying_booking_count?: number | null;
  churn_reason?: string | null;
  returned_at?: string | null;
  next_follow_up_at?: string | null;
};

type HandoffRow = {
  id: string;
  from_desk: string;
  to_desk: string;
  status: string;
  note: string | null;
};

function ownerLabel(
  owners: Record<string, { full_name: string | null; email: string | null }>,
  id: string | null,
): string {
  if (!id) return "Unassigned";
  const u = owners[id];
  return u?.full_name?.trim() || u?.email || id.slice(0, 8);
}

export function ProviderOpsCasePanel(props: {
  leadId?: string | null;
  userId?: string | null;
  providerId?: string | null;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.caseLookup(
      props.leadId ?? props.userId ?? props.providerId ?? "none",
    ),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (props.leadId) p.set("lead_id", props.leadId);
      if (props.userId) p.set("user_id", props.userId);
      if (props.providerId) p.set("provider_id", props.providerId);
      return adminApi.getJson<{
        case: CaseRow | null;
        owners: Record<string, { id: string; full_name: string | null; email: string | null }>;
        pending_handoffs: HandoffRow[];
      }>(`/api/admin/provider-ops/cases/lookup?${p.toString()}`);
    },
    enabled: Boolean(props.leadId || props.userId || props.providerId),
  });

  const acceptHandoff = useMutation({
    mutationFn: (handoffId: string) =>
      adminApi.postJson(`/api/admin/provider-ops/handoffs/${handoffId}/accept`, {}),
    onSuccess: () => {
      adminToast.success("Handoff accepted");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(e.message || "Could not accept handoff"),
  });

  const caseId = q.data?.case?.id;
  const touchesQ = useQuery({
    queryKey: [...adminQueryKeys.providerOps.caseLookup(props.providerId ?? props.leadId ?? "none"), "touches", caseId ?? ""],
    queryFn: () =>
      adminApi.getJson<{ touches: Array<{ channel: string; note: string | null; created_at: string }> }>(
        `/api/admin/provider-ops/cases/${caseId}/touches`,
      ),
    enabled: Boolean(caseId),
  });

  if (q.isLoading || !q.data?.case) return null;
  const c = q.data.case;
  const owners = q.data.owners ?? {};

  return (
    <AdminPanel title="Ops case">
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Desk</dt>
          <dd className="font-medium text-gray-900">{c.current_desk}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Status</dt>
          <dd className="font-medium text-gray-900">{c.status}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Sales owner</dt>
          <dd>{ownerLabel(owners, c.sales_owner_id)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Onboarding owner</dt>
          <dd>{ownerLabel(owners, c.onboarding_owner_id)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Retention owner</dt>
          <dd>{ownerLabel(owners, c.retention_owner_id)}</dd>
        </div>
        {c.churn_reason ? (
          <div>
            <dt className="text-gray-500">Churn reason</dt>
            <dd className="font-medium text-gray-900">{c.churn_reason.replace(/_/g, " ")}</dd>
          </div>
        ) : null}
        {c.next_follow_up_at ? (
          <div>
            <dt className="text-gray-500">Next follow-up</dt>
            <dd>{new Date(c.next_follow_up_at).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
      {(touchesQ.data?.touches?.length ?? 0) > 0 ? (
        <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto border-t border-gray-100 pt-3 text-xs text-gray-600">
          {(touchesQ.data?.touches ?? []).map((t) => (
            <li key={t.created_at + t.channel}>
              {new Date(t.created_at).toLocaleString()} · {t.channel}
              {t.note ? ` — ${t.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {(q.data.pending_handoffs ?? []).length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-gray-100 pt-4">
          {(q.data.pending_handoffs ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                Pending: {h.from_desk} → {h.to_desk}
                {h.note ? ` — ${h.note}` : ""}
              </span>
              <button
                type="button"
                className="rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800"
                disabled={acceptHandoff.isPending}
                onClick={() => acceptHandoff.mutate(h.id)}
              >
                Accept
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

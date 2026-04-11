import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";

type CampaignDetail = {
  id: string;
  provider_id: string;
  status: string;
  billing_model: string;
  budget: number;
  spent: number;
  bid_cpc: number;
  daily_budget: number | null;
  pack_impressions: number | null;
  total_impressions: number | null;
  duration_days: number | null;
  start_at: string | null;
  end_at: string | null;
  targeting: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  provider: {
    id: string;
    business_name: string;
    owner_name: string | null;
    email: string | null;
    phone: string | null;
    slug: string | null;
  } | null;
  events_30d: { impressions: number; clicks: number; books: number };
  budget_orders: {
    id: string;
    amount: number;
    payment_status: string;
    paystack_reference: string | null;
    created_at: string;
  }[];
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  draft: "bg-gray-100 text-gray-700",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-100 text-slate-500",
};

const MODEL_LABELS: Record<string, string> = {
  cpc_budget: "CPC Budget",
  impression_pack: "Impression Pack",
  time_based: "Time-Based Boost",
};

function fmt(v: number) {
  return `R ${v.toFixed(2)}`;
}

export function AdsCampaignDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );

  const [actionDialog, setActionDialog] = useState<"pause" | "resume" | "end" | null>(null);
  const [actionReason, setActionReason] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.ads.campaignDetail(id),
    queryFn: () => adminApi.getJson<CampaignDetail>(`/api/admin/ads/campaigns/${encodeURIComponent(id)}`, { timeoutMs: 30_000 }),
    enabled: allowed && !!id,
  });

  const actionMutation = useMutation({
    mutationFn: (payload: { status: string; reason?: string }) =>
      adminApi.patchJson(`/api/admin/ads/campaigns/${encodeURIComponent(id)}`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.ads.all() });
      setActionDialog(null);
      setActionReason("");
    },
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Campaign" />
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

  const campaign = q.data;
  if (!campaign) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Campaign" />
        <AdminPanel>
          <p className="text-gray-500 text-sm">Campaign not found.</p>
          <Link to={adminSpaTo("/admin/ads")} className="mt-4 inline-block text-sm text-primary underline">
            Back to Ads
          </Link>
        </AdminPanel>
      </div>
    );
  }

  const ctr = campaign.events_30d.impressions
    ? ((campaign.events_30d.clicks / campaign.events_30d.impressions) * 100).toFixed(1)
    : "0.0";

  const actionStatusMap = { pause: "paused", resume: "active", end: "ended" } as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Campaign Detail"
        description={`Campaign ${campaign.id.slice(0, 8)}… · ${MODEL_LABELS[campaign.billing_model] ?? campaign.billing_model}`}
        actions={
          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[campaign.status] ?? "bg-gray-100 text-gray-700"}`}>
              {campaign.status}
            </span>
            {campaign.status === "active" && (
              <button
                type="button"
                className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                onClick={() => setActionDialog("pause")}
              >
                Pause
              </button>
            )}
            {(campaign.status === "paused" || campaign.status === "draft") && (
              <button
                type="button"
                className="rounded border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
                onClick={() => setActionDialog("resume")}
              >
                Resume
              </button>
            )}
            {campaign.status !== "ended" && (
              <button
                type="button"
                className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
                onClick={() => setActionDialog("end")}
              >
                End
              </button>
            )}
            <button
              type="button"
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => void navigate(adminSpaTo("/admin/ads"))}
            >
              ← Back
            </button>
          </div>
        }
      />

      {/* Provider + Campaign info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Provider</h2>
          {campaign.provider ? (
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-gray-900">{campaign.provider.business_name}</p>
              {campaign.provider.owner_name && <p className="text-gray-600">{campaign.provider.owner_name}</p>}
              {campaign.provider.email && <p className="text-gray-600">{campaign.provider.email}</p>}
              {campaign.provider.phone && <p className="text-gray-600">{campaign.provider.phone}</p>}
              <Link
                to={adminSpaTo(`/admin/providers/${campaign.provider_id}`)}
                className="mt-2 inline-block text-sm text-primary underline"
              >
                View Provider →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Provider data unavailable</p>
          )}
        </AdminPanel>

        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Campaign Details</h2>
          <dl className="space-y-2 text-sm">
            {[
              ["Billing Model", MODEL_LABELS[campaign.billing_model] ?? campaign.billing_model],
              [campaign.billing_model === "time_based" ? "Paid" : "Budget", fmt(campaign.budget)],
              ...(campaign.billing_model !== "time_based" ? [["Spent", fmt(campaign.spent)]] : []),
              ...(campaign.bid_cpc > 0 && campaign.billing_model === "cpc_budget" ? [["Bid CPC", fmt(campaign.bid_cpc)]] : []),
              ...(campaign.daily_budget ? [["Daily Budget", fmt(campaign.daily_budget)]] : []),
              ...(campaign.pack_impressions ? [["Pack Impressions", campaign.pack_impressions.toLocaleString()]] : []),
              ...(campaign.total_impressions != null ? [["Impressions Used", campaign.total_impressions.toLocaleString()]] : []),
              ...(campaign.duration_days ? [["Duration", `${campaign.duration_days} days`]] : []),
              ...(campaign.start_at ? [["Start", new Date(campaign.start_at).toLocaleString()]] : []),
              ...(campaign.end_at ? [["End", new Date(campaign.end_at).toLocaleString()]] : []),
              ["Created", new Date(campaign.created_at).toLocaleDateString()],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      </div>

      {/* 30-day Performance */}
      <AdminPanel>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">30-Day Performance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Impressions", value: campaign.events_30d.impressions.toLocaleString() },
            { label: "Clicks", value: campaign.events_30d.clicks.toLocaleString() },
            { label: "CTR", value: `${ctr}%` },
            { label: "Bookings from Ads", value: campaign.events_30d.books.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="mt-1 text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </AdminPanel>

      {/* Targeting */}
      {campaign.targeting && Object.keys(campaign.targeting).length > 0 && (
        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Targeting</h2>
          <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
            {JSON.stringify(campaign.targeting, null, 2)}
          </pre>
        </AdminPanel>
      )}

      {/* Payment History */}
      {campaign.budget_orders.length > 0 && (
        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Payment History ({campaign.budget_orders.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaign.budget_orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(o.amount)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${o.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{o.paystack_reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      )}

      {/* Action Dialog */}
      <AdminModal
        open={!!actionDialog}
        onClose={() => setActionDialog(null)}
        title={actionDialog === "pause" ? "Pause Campaign" : actionDialog === "resume" ? "Resume Campaign" : "End Campaign"}
        description={
          actionDialog === "pause"
            ? "This will stop the campaign from showing in sponsored slots."
            : actionDialog === "resume"
              ? "This will re-activate the campaign and resume ad delivery."
              : "This will permanently end the campaign. It cannot be restarted."
        }
        footer={
          <>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setActionDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm text-white disabled:opacity-50 ${actionDialog === "end" ? "bg-red-700 hover:bg-red-800" : "bg-gray-900 hover:bg-gray-800"}`}
              disabled={actionMutation.isPending}
              onClick={() => {
                if (actionDialog) {
                  actionMutation.mutate({ status: actionStatusMap[actionDialog], reason: actionReason || undefined });
                }
              }}
            >
              {actionMutation.isPending ? "Processing…" : "Confirm"}
            </button>
          </>
        }
      >
        <label className="block text-sm">
          Reason (optional)
          <input
            type="text"
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            placeholder="Internal note…"
            className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
          />
        </label>
        <AdminMutationAlert errors={[actionMutation.error]} />
      </AdminModal>
    </div>
  );
}

import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminSectionQueueHub } from "@/components/admin/AdminSectionQueueHub";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { ApprovalCard } from "@/components/brand/ApprovalCard";

type MyWorkPayload = {
  briefs_in_review: { id: string; name: string; status: string }[];
  live_campaigns: { id: string; name: string; stage: string }[];
  stale_placements: { id: string; name: string | null; channel_key: string; campaign_id: string }[];
  owned_channel_clashes: Array<{
    channel_key: string;
    campaign_id: string;
    campaign_name: string;
    flight_start: string;
    flight_end: string;
  }>;
  stale_metric_days: number;
  pending_approvals: { id: string; subject_type: string; due_at: string | null }[];
  open_tasks: { id: string; title: string; due_at: string | null; campaign_id: string | null }[];
};

export function BrandMyWorkPage() {
  useAdminDocumentTitle("Brand — My work");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.brandMyWork(),
    queryFn: () => adminApi.getJson<MyWorkPayload>("/api/admin/brand/my-work"),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={6} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const data = q.data!;

  return (
    <div className="space-y-6">
      <AdminSectionQueueHub
        title="Brand desk"
        description="Briefs, integrated campaigns, and period pack. Periods use UTC."
        metrics={[
          { label: "Briefs in review", value: data.briefs_in_review.length, href: "/admin/brand/briefs" },
          { label: "Live campaigns", value: data.live_campaigns.length, href: "/admin/brand/board" },
          {
            label: `Stale placements (>${data.stale_metric_days}d)`,
            value: data.stale_placements.length,
            urgent: data.stale_placements.length > 0,
            href: "/admin/brand/weekly-update",
          },
        ]}
        quickLinks={[
          {
            id: "weekly",
            label: "Weekly update",
            description: "Enter spend and delivery metrics for live paid lines.",
            href: "/admin/brand/weekly-update",
            variant: data.stale_placements.length > 0 ? "urgent" : "default",
          },
          {
            id: "brief",
            label: "Start a brief",
            description: "Submit a new integrated campaign brief.",
            href: "/admin/brand/briefs",
            variant: "mine",
          },
          {
            id: "pack",
            label: "Period pack",
            description: "Leadership read for the selected UTC period.",
            href: "/admin/brand/pack",
            variant: "default",
          },
        ]}
        queueLinks={[
          {
            title: "Campaign board",
            description: "Move campaigns through planning → live → closed.",
            href: "/admin/brand/board",
            count: data.live_campaigns.length,
          },
          {
            title: "Brief inbox",
            description: "Review and accept briefs into campaigns.",
            href: "/admin/brand/briefs",
            count: data.briefs_in_review.length,
            urgent: data.briefs_in_review.length > 0,
          },
        ]}
      />

      <AdminPanel title="Approvals waiting on you">
        {data.pending_approvals.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending approvals.</p>
        ) : (
          <div className="space-y-2">
            {data.pending_approvals.map((a) => (
              <ApprovalCard key={a.id} approval={{ ...a, status: "pending", comment: null, approver_id: null }} onUpdated={() => void q.refetch()} />
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminPanel title="Open tasks">
        {data.open_tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No open tasks.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.open_tasks.map((t) => (
              <li key={t.id} className="flex justify-between py-2">
                <span>{t.title}</span>
                {t.campaign_id ? (
                  <Link to={adminSpaTo(`/admin/brand/campaigns/${t.campaign_id}`)} className="text-violet-700">
                    Campaign
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel title="Briefs waiting on review">
        {data.briefs_in_review.length === 0 ? (
          <p className="text-sm text-zinc-500">No briefs in review.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.briefs_in_review.map((b) => (
              <li key={b.id} className="flex justify-between py-2">
                <Link to={adminSpaTo(`/admin/brand/briefs/${b.id}`)} className="font-medium text-violet-700 hover:underline">
                  {b.name}
                </Link>
                <span className="text-zinc-500">{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel title="Placements needing weekly update">
        {data.stale_placements.length === 0 ? (
          <p className="text-sm text-zinc-500">All live placements are up to date.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.stale_placements.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{p.name ?? p.channel_key}</span>
                <Link to={adminSpaTo("/admin/brand/weekly-update")} className="text-violet-700 hover:underline">
                  Update
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      {data.owned_channel_clashes.length > 0 && (
        <AdminPanel title="Owned channel clashes">
          <ul className="space-y-2 text-sm text-amber-900">
            {data.owned_channel_clashes.map((c, i) => (
              <li key={`${c.channel_key}-${c.campaign_id}-${i}`}>
                <span className="font-medium">{c.channel_key}</span> — {c.campaign_name} (
                {c.flight_start.slice(0, 10)} → {c.flight_end.slice(0, 10)})
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}

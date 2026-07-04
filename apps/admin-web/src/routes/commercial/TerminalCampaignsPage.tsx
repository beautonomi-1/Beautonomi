import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type TerminalCampaign = {
  id: string;
  name: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  click_count: number;
  conversion_count: number;
  opt_out_count: number;
  created_at: string;
  sent_at: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-800",
  sending: "bg-purple-100 text-purple-800",
  sent: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export function TerminalCampaignsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Campaigns");

  const { data, isLoading, isError, refetch } = useQuery<{ items: TerminalCampaign[]; total: number }>({
    queryKey: adminQueryKeys.commercialTerminalCampaigns,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-campaigns"),
    enabled: allowed,
  });

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock message="Failed to load terminal campaigns" onRetry={() => refetch()} />;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Campaigns"
        description="Targeted terminal upsell and announcement campaigns."
      />

      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No terminal campaigns yet"
            description="Create campaigns from Terminal Insights to target provider cohorts."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Campaign</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Recipients</AdminTh>
                <AdminTh>Sent</AdminTh>
                <AdminTh>Clicks</AdminTh>
                <AdminTh>Conversions</AdminTh>
                <AdminTh>Opt-outs</AdminTh>
                <AdminTh>Sent at</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <AdminTd className="font-medium">{c.name}</AdminTd>
                  <AdminTd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {c.status}
                    </span>
                  </AdminTd>
                  <AdminTd>{c.recipient_count.toLocaleString()}</AdminTd>
                  <AdminTd>{c.sent_count.toLocaleString()}</AdminTd>
                  <AdminTd>{c.click_count.toLocaleString()}</AdminTd>
                  <AdminTd>{c.conversion_count.toLocaleString()}</AdminTd>
                  <AdminTd>{c.opt_out_count.toLocaleString()}</AdminTd>
                  <AdminTd className="text-gray-500">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : "—"}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}

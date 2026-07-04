import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
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

type CampaignForm = {
  name: string;
  description: string;
  message_body: string;
  cta_label: string;
  cta_url: string;
  announcement_type: string;
  target_ownership: string;
  target_interest: string;
  target_provider: string;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-800",
  sending: "bg-purple-100 text-purple-800",
  sent: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const defaultForm = (): CampaignForm => ({
  name: "",
  description: "",
  message_body: "",
  cta_label: "View terminals",
  cta_url: "",
  announcement_type: "promotion",
  target_ownership: "",
  target_interest: "",
  target_provider: "",
});

export function TerminalCampaignsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Campaigns");
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(defaultForm);

  const { data, isLoading, isError, refetch } = useQuery<{ items: TerminalCampaign[]; total: number }>({
    queryKey: adminQueryKeys.commercialTerminalCampaigns,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-campaigns"),
    enabled: allowed,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const target_criteria: Record<string, string> = {};
      if (form.target_ownership) target_criteria.terminal_ownership_status = form.target_ownership;
      if (form.target_interest) target_criteria.interested_in_platform_terminal = form.target_interest;
      if (form.target_provider) target_criteria.terminal_provider = form.target_provider;

      return adminApi.postJson("/api/admin/commercial/terminal-campaigns", {
        name: form.name.trim(),
        description: form.description.trim() || null,
        message_body: form.message_body.trim(),
        cta_label: form.cta_label.trim() || null,
        cta_url: form.cta_url.trim() || null,
        announcement_type: form.announcement_type,
        target_criteria,
      });
    },
    onSuccess: () => {
      adminToast.success("Campaign created and sent");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalCampaigns });
      setModalOpen(false);
      setForm(defaultForm());
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to create campaign"),
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
        actions={
          <button
            type="button"
            onClick={() => { setForm(defaultForm()); setModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        }
      />

      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No terminal campaigns yet"
            description="Create a campaign to target provider cohorts from Terminal Insights filters."
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

      <AdminModal
        open={modalOpen}
        title="Create terminal campaign"
        description="Recipients are resolved from provider terminal profiles matching your target criteria."
        onClose={() => setModalOpen(false)}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={createMut.isPending || !form.name.trim() || !form.message_body.trim()}
              onClick={() => createMut.mutate()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {createMut.isPending ? "Sending…" : "Create & send"}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Campaign name</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={4} value={form.message_body} onChange={(e) => setForm((f) => ({ ...f, message_body: e.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">CTA label</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">CTA URL</label>
              <input type="url" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.cta_url} onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))} placeholder="https://…" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Target ownership</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.target_ownership} onChange={(e) => setForm((f) => ({ ...f, target_ownership: e.target.value }))}>
                <option value="">All</option>
                <option value="has_terminal">Has terminal</option>
                <option value="no_terminal">No terminal</option>
                <option value="planning_to_get_terminal">Planning to get</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Target interest</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.target_interest} onChange={(e) => setForm((f) => ({ ...f, target_interest: e.target.value }))}>
                <option value="">All</option>
                <option value="yes">Interested</option>
                <option value="maybe_later">Maybe later</option>
                <option value="no">Not interested</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Target provider</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.target_provider} onChange={(e) => setForm((f) => ({ ...f, target_provider: e.target.value }))}>
                <option value="">All</option>
                <option value="yoco">Yoco</option>
                <option value="ikhokha">iKhokha</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

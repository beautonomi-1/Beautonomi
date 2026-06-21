"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { Link } from "react-router-dom";
import { adminSpaTo } from "@/lib/adminSpaPath";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type WhatsAppTemplateRow = {
  id: string;
  key: string;
  name?: string;
  whatsapp_content_sid?: string | null;
  whatsapp_category?: string | null;
  whatsapp_template_status?: string | null;
  whatsapp_approval_name?: string | null;
  whatsapp_content_error?: string | null;
  whatsapp_content_synced_at?: string | null;
  needs_repush?: boolean;
};

type Payload = { templates: WhatsAppTemplateRow[]; remote?: Array<{ sid: string; friendly_name?: string; date_created?: string }> };

export function WhatsAppContentTemplatesPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing access is required.",
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.whatsappContentTemplates(),
    queryFn: () =>
      adminApi.getJson<Payload>("/api/admin/whatsapp/content-templates", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const pushAllMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/whatsapp/content-templates/push-all", { submit: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsappContentTemplates() });
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "notification-templates"] });
    },
  });

  const syncAllMut = useMutation({
    mutationFn: () => adminApi.postJson("/api/admin/whatsapp/content-templates/sync-all", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsappContentTemplates() });
    },
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="WhatsApp Content templates" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const templates = q.data?.templates ?? [];
  const remote = q.data?.remote ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="WhatsApp Content templates"
        description="Twilio Content API templates for transactional WhatsApp. Push local notification templates and sync Meta approval status."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(pushAllMut.isPending)}
              disabled={pushAllMut.isPending}
              onClick={() => pushAllMut.mutate()}
            >
              {pushAllMut.isPending ? "Pushing…" : "Push all (drift-aware)"}
            </button>
            <button
              type="button"
              className={adminToolbarButtonClass(syncAllMut.isPending)}
              disabled={syncAllMut.isPending}
              onClick={() => syncAllMut.mutate()}
            >
              {syncAllMut.isPending ? "Syncing…" : "Sync all statuses"}
            </button>
            <Link to={adminSpaTo("/admin/notification-templates")} className={adminToolbarButtonClass(false)}>
              Edit templates
            </Link>
          </div>
        }
      />

      <AdminPanel>
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Key</AdminTh>
              <AdminTh>Category</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Content SID</AdminTh>
              <AdminTh>Drift</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {templates.map((t) => (
              <tr key={t.id}>
                <AdminTd>
                  <span className="font-mono text-xs">{t.key}</span>
                </AdminTd>
                <AdminTd className="capitalize">{t.whatsapp_category ?? "—"}</AdminTd>
                <AdminTd>
                  <span
                    className={
                      t.whatsapp_template_status === "approved"
                        ? "text-green-700"
                        : t.whatsapp_template_status === "rejected"
                          ? "text-red-600"
                          : "text-gray-600"
                    }
                  >
                    {t.whatsapp_template_status ?? "unknown"}
                  </span>
                  {t.whatsapp_content_error && (
                    <p className="mt-1 text-xs text-red-600">{t.whatsapp_content_error}</p>
                  )}
                </AdminTd>
                <AdminTd>
                  <span className="font-mono text-xs">{t.whatsapp_content_sid ?? "—"}</span>
                </AdminTd>
                <AdminTd>{t.needs_repush ? "Needs re-push" : "—"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
        {templates.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No WhatsApp-capable templates yet.</p>
        )}
      </AdminPanel>

      {remote.length > 0 && (
        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900">Remote Twilio Content (reconcile)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Content templates in Twilio that may not match a local notification template row.
          </p>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Content SID</AdminTh>
                <AdminTh>Friendly name</AdminTh>
                <AdminTh>Created</AdminTh>
                <AdminTh>Linked locally</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {remote.map((r) => {
                const linked = templates.some((t) => t.whatsapp_content_sid === r.sid);
                return (
                  <tr key={r.sid}>
                    <AdminTd>
                      <span className="font-mono text-xs">{r.sid}</span>
                    </AdminTd>
                    <AdminTd>{r.friendly_name ?? "—"}</AdminTd>
                    <AdminTd className="text-xs">
                      {r.date_created ? new Date(r.date_created).toLocaleString() : "—"}
                    </AdminTd>
                    <AdminTd>{linked ? "Yes" : "Orphan"}</AdminTd>
                  </tr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      )}
    </div>
  );
}

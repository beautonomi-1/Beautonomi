import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
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
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

type Payload = { templates: Record<string, unknown>[] };

export function NotificationTemplatesListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp] = useSearchParams();
  const channel = sp.get("channel") || "";
  const enabled = sp.get("enabled") || "";
  const qk = useMemo(() => adminQueryKeys.notificationTemplates(`c=${channel}|e=${enabled}`), [channel, enabled]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (channel) p.set("channel", channel);
      if (enabled === "true" || enabled === "false") p.set("enabled", enabled);
      const qs = p.toString();
      return adminApi.getJson<Payload>(`/api/admin/notification-templates${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data?.templates ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Notification templates" />
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
      <AdminPageHeader title="Notification templates" description="GET /api/admin/notification-templates" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/notification-templates")} className="font-medium text-gray-900 underline">
          Legacy editor →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No templates" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Key</AdminTh>
              <AdminTh>Title</AdminTh>
              <AdminTh>Enabled</AdminTh>
              <AdminTh>Channels</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const ch = row.channels as unknown[] | undefined;
              return (
                <tr key={String(row.id ?? row.key ?? "")}>
                  <AdminTd className="font-mono text-xs">{String(row.key ?? row.name ?? "")}</AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs">{String(row.title_template ?? row.title ?? "")}</AdminTd>
                  <AdminTd>{String(row.enabled ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{Array.isArray(ch) ? ch.join(", ") : ""}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

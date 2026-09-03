import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";

type InboundPayload = {
  events: Array<{
    id: string;
    event_type?: string | null;
    status: string;
    error_message?: string | null;
    created_at: string;
  }>;
  signature_failures?: { last_24h?: Record<string, { events: number }>; last_7d?: Record<string, { events: number }> };
};

export function FlutterwaveIntegrationPage() {
  useAdminDocumentTitle("Flutterwave");
  const { allowed, denied } = useSuperadminPage("Superadmin access is required.");

  const query = useQuery({
    queryKey: adminQueryKeys.inboundWebhooks("flutterwave", "", false, ""),
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<InboundPayload>("/api/admin/webhooks/inbound?source=flutterwave&limit=20", {
        timeoutMs: 30_000,
      }),
  });

  if (denied) return denied;

  const authFailed = isAdminApiAuthFailure(query.error);
  const rows = query.data?.events ?? [];
  const sig24 = query.data?.signature_failures?.last_24h?.flutterwave?.events ?? 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Flutterwave"
        description="Webhook health for Flutterwave charges. Secret lives in FLUTTERWAVE_WEBHOOK_SECRET (server env). Replay from Inbound webhooks."
      />
      <AdminPanel>
        <p className="mb-3 text-sm text-gray-700">
          Signature rejects (24h, this source): <strong>{sig24}</strong>. Configure the dashboard webhook URL to{" "}
          <code className="rounded bg-gray-100 px-1">/api/payments/flutterwave/webhook</code>.
        </p>
        <div className="mb-3 flex gap-2">
          <Link className="text-sm text-violet-700 underline" to={adminSpaTo("/admin/webhooks/inbound?source=flutterwave")}>
            Open inbound forensics
          </Link>
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No Flutterwave events yet" description="Events appear after the first signed webhook." />
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((e) => (
              <li key={e.id} className="rounded-lg border border-gray-100 px-3 py-2">
                <span className="font-mono text-xs">{e.event_type ?? "event"}</span> · {e.status} ·{" "}
                {new Date(e.created_at).toLocaleString()}
                {e.error_message ? <span className="block text-xs text-red-700">{e.error_message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}

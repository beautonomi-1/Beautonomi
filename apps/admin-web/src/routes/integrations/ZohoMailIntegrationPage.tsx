import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToast } from "@/lib/adminToast";

type ZohoConfig = {
  data_centers: string[];
  connections: Array<Record<string, unknown>>;
  mailboxes: Array<Record<string, unknown>>;
  quarantine: Array<Record<string, unknown>>;
  limits_note?: string;
};

export function ZohoMailIntegrationPage() {
  useAdminDocumentTitle("Zoho Mail");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required.",
  );
  const qc = useQueryClient();
  const [grantCode, setGrantCode] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.zohoMailConfig(),
    queryFn: () => adminApi.getJson<ZohoConfig>("/api/admin/integrations/zoho-mail"),
    enabled: allowed,
  });

  const saveConn = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson("/api/admin/integrations/zoho-mail", { kind: "connection", ...body }),
    onSuccess: () => {
      adminToast.success("Connection saved");
      setGrantCode("");
      setClientSecret("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.zohoMailConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const saveMailbox = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson("/api/admin/integrations/zoho-mail", { kind: "mailbox", ...body }),
    onSuccess: () => {
      adminToast.success("Mailbox saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.zohoMailConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const testConn = useMutation({
    mutationFn: (body: { connection_id: string; mailbox_address: string }) =>
      adminApi.postJson("/api/admin/integrations/zoho-mail/test", body),
    onSuccess: () => adminToast.success("Connection test passed"),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const syncNow = useMutation({
    mutationFn: () => adminApi.postJson("/api/admin/integrations/zoho-mail/sync", {}),
    onSuccess: () => {
      adminToast.success("Sync finished");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.zohoMailConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const createFromQuarantine = useMutation({
    mutationFn: (mailRowId: string) =>
      adminApi.postJson<{ ticket_id: string }>(
        `/api/admin/integrations/zoho-mail/quarantine/${mailRowId}/create-ticket`,
        {},
      ),
    onSuccess: (data) => {
      adminToast.success(`Ticket created (${data.ticket_id})`);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.zohoMailConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const STALE_SYNC_MS = 15 * 60 * 1000;
  const staleInboundMailboxes = (q.data?.mailboxes ?? []).filter((mb) => {
    const row = mb as { inbound_enabled?: boolean; last_sync_at?: string | null };
    if (!row.inbound_enabled) return false;
    const at = row.last_sync_at ? new Date(row.last_sync_at).getTime() : 0;
    return !at || Date.now() - at > STALE_SYNC_MS;
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton />;
  if (q.isError) {
    return (
      <AdminRetryBlock
        message={q.error instanceof Error ? q.error.message : "Failed to load Zoho Mail"}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const conn = q.data?.connections?.[0] as Record<string, unknown> | undefined;
  const mailbox = q.data?.mailboxes?.[0] as Record<string, unknown> | undefined;
  const webhookBase =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/zoho-mail?token=` : "";

  return (
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Zoho Mail"
        description="Inbound support mail and desk replies on the same thread. Secrets never leave the server."
      />

      {q.data?.limits_note ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {q.data.limits_note}
        </p>
      ) : null}

      {staleInboundMailboxes.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Inbound sync is stale (&gt;15 min) for:{" "}
          {staleInboundMailboxes.map((m) => String((m as { address?: string }).address ?? "mailbox")).join(", ")}.
          Check cron, connection auth, or run Sync now.
        </p>
      ) : null}

      <AdminPanel title="Connection">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Data center
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2"
              defaultValue={String(conn?.data_center ?? q.data?.data_centers?.[0] ?? "")}
              id="zoho-dc"
            >
              {(q.data?.data_centers ?? []).map((dc) => (
                <option key={dc} value={dc}>
                  {dc}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Client ID
            <input className="mt-1 w-full rounded-lg border px-3 py-2" defaultValue={String(conn?.client_id ?? "")} id="zoho-client-id" />
          </label>
          <label className="text-sm">
            Client secret
            <input
              type="password"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={conn?.has_client_secret ? "•••• (unchanged)" : "Paste secret"}
            />
          </label>
          <label className="text-sm">
            Grant code (single use)
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={grantCode}
              onChange={(e) => setGrantCode(e.target.value)}
              placeholder="From Zoho Self Client"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
            onClick={() => {
              const dc = (document.getElementById("zoho-dc") as HTMLSelectElement).value;
              const clientId = (document.getElementById("zoho-client-id") as HTMLInputElement).value;
              saveConn.mutate({
                id: conn?.id,
                data_center: dc,
                client_id: clientId,
                ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}),
                ...(grantCode.trim() ? { grant_code: grantCode.trim() } : {}),
                enabled: true,
              });
            }}
          >
            Save connection
          </button>
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => syncNow.mutate()}
            disabled={syncNow.isPending}
          >
            <RefreshCw className="mr-1 inline h-4 w-4" />
            Sync now
          </button>
        </div>
        {conn?.last_error ? (
          <p className="mt-3 text-sm text-red-600">Last error: {String(conn.last_error)}</p>
        ) : null}
        <p className="mt-2 text-xs text-gray-500">
          Status: {String(conn?.auth_status ?? "none")} · Account: {String(conn?.zoho_account_id ?? "—")}
        </p>
      </AdminPanel>

      <AdminPanel title="Mailbox (support@beautonomi.com)">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Address
            <input className="mt-1 w-full rounded-lg border px-3 py-2" defaultValue={String(mailbox?.address ?? "support@beautonomi.com")} id="mb-address" />
          </label>
          <label className="text-sm">
            Tenant ID
            <input className="mt-1 w-full rounded-lg border px-3 py-2" defaultValue={String(mailbox?.tenant_id ?? "")} id="mb-tenant" placeholder="ZA tenant UUID" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked={mailbox?.inbound_enabled === true} id="mb-inbound" /> Inbound
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked={mailbox?.outbound_enabled === true} id="mb-outbound" /> Outbound
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
            onClick={() => {
              if (!conn?.id) {
                adminToast.error("Save a connection first");
                return;
              }
              saveMailbox.mutate({
                id: mailbox?.id,
                connection_id: conn.id,
                address: (document.getElementById("mb-address") as HTMLInputElement).value,
                tenant_id: (document.getElementById("mb-tenant") as HTMLInputElement).value,
                inbound_enabled: (document.getElementById("mb-inbound") as HTMLInputElement).checked,
                outbound_enabled: (document.getElementById("mb-outbound") as HTMLInputElement).checked,
                rotate_webhook_token: !mailbox?.webhook_token,
              });
            }}
          >
            Save mailbox
          </button>
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm"
            disabled={!conn?.id}
            onClick={() =>
              testConn.mutate({
                connection_id: String(conn!.id),
                mailbox_address: String((document.getElementById("mb-address") as HTMLInputElement)?.value ?? "support@beautonomi.com"),
              })
            }
          >
            Test connection
          </button>
        </div>
        {mailbox?.webhook_token ? (
          <p className="mt-3 break-all text-xs text-gray-600">
            Webhook URL: {webhookBase}
            {String(mailbox.webhook_token)}
          </p>
        ) : null}
        {mailbox?.last_sync_at ? (
          <p className="mt-2 text-xs text-gray-500">
            Last sync: {String(mailbox.last_sync_at)} · imported {String(mailbox.last_run_imported)} · appended{" "}
            {String(mailbox.last_run_appended)}
          </p>
        ) : null}
      </AdminPanel>

      {(q.data?.quarantine?.length ?? 0) > 0 ? (
        <AdminPanel title="Quarantine (skipped / failed)">
          <ul className="divide-y text-sm">
            {q.data!.quarantine.map((row) => (
              <li key={String(row.id)} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{String(row.from_address ?? "—")}</span> — {String(row.subject ?? "")}
                <span className="text-gray-500">{String(row.skip_reason ?? row.delivery_status)}</span>
                <button
                  type="button"
                  className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                  disabled={createFromQuarantine.isPending}
                  onClick={() => createFromQuarantine.mutate(String(row.id))}
                >
                  Create ticket
                </button>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}
    </div>
  );
}

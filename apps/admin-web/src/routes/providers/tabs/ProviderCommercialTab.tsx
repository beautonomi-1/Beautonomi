import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { formatPaycloudMerchantOptionLabel } from "@/lib/formatPaycloudMerchantLabel";
import { cn } from "@/lib/cn";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { ProviderDetail, str, OWNERSHIP_STATUS_LABELS, TERMINAL_VENDOR_LABELS } from "./types";
import { PaycloudPaymentDetailModal } from "@/routes/integrations/PaycloudPaymentDetailModal";

type Props = {
  id: string;
  providerCanonicalId: string;
  row: ProviderDetail;
  hasCommercialAccess: boolean;
};

type TerminalIntegrationRow = {
  id?: string;
  vendor?: string;
  status?: string;
  credential_mode?: string;
  environment?: string;
  is_enabled?: boolean;
  merchant_id?: string | null;
  business_name?: string | null;
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  active_device_count?: number;
};

type TerminalNote = {
  id?: string;
  body?: string;
  created_at?: string;
  author_id?: string;
  /** Supabase join key — comes back as `users` not `author` */
  users?: { full_name?: string | null; email?: string | null } | null;
};

type PaycloudReadinessBlocker = {
  code: string;
  title: string;
  actionLabel: string;
  href?: string;
};

type PaycloudReadiness = {
  ready: boolean;
  blockers: PaycloudReadinessBlocker[];
  warnings: Array<{ code: string; message: string }>;
  terminals: { active: number; suspended: number; inFlight: number; withoutMerchant: number };
  settings: { accept: boolean; qr: boolean; cashback: boolean };
  plan?: { enabled: boolean; maxTerminals: number | null; usedTerminals: number };
  account_environment?: "sandbox" | "live" | "mixed" | null;
};

type PaycloudMerchant = {
  id: string;
  label: string;
  merchant_no: string;
  store_no: string;
  environment: string;
};

type PaycloudTerminalRow = {
  id: string;
  display_name: string;
  terminal_sn: string;
  status: string;
  is_active?: boolean;
  in_flight_payment_id?: string | null;
  last_error?: string | null;
  last_used_at?: string | null;
  merchant?: PaycloudMerchant | null;
  location?: { id: string; name: string } | null;
};

type PaycloudPaymentRow = {
  id: string;
  merchant_order_no: string;
  amount: number;
  expected_amount: number;
  status: string;
  amount_match_status: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

type ProviderPaycloudResponse = {
  provider: { id: string; business_name?: string | null; accept_paycloud?: boolean };
  readiness: PaycloudReadiness;
  merchants: PaycloudMerchant[];
  terminals: PaycloudTerminalRow[];
  recent_payments: PaycloudPaymentRow[];
};

function paycloudMoney(amount: number | string | null | undefined, currency = "ZAR") {
  return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
}

function paycloudStatusClass(status: string) {
  const s = status.toLowerCase();
  if (["successful", "exact", "active", "assigned"].includes(s)) {
    return "bg-emerald-100 text-emerald-900";
  }
  if (["pending", "processing", "under", "over", "mismatch"].includes(s)) {
    return "bg-amber-100 text-amber-900";
  }
  if (["failed", "cancelled", "closed", "suspended"].includes(s)) {
    return "bg-red-100 text-red-900";
  }
  return "bg-gray-100 text-gray-800";
}

function paycloudChecklistItems(readiness: PaycloudReadiness | undefined) {
  const blockers = new Set((readiness?.blockers ?? []).map((b) => b.code));
  return [
    { key: "flag", label: "Platform flag enabled", ok: !blockers.has("FLAG_OFF") },
    { key: "plan", label: "Plan includes card machines", ok: !blockers.has("PLAN_REQUIRED") },
    {
      key: "accept",
      label: "Provider accepts in-person cards",
      ok: readiness?.settings.accept === true,
    },
    {
      key: "terminals",
      label: "At least one active terminal",
      ok: (readiness?.terminals.active ?? 0) > 0,
    },
    {
      key: "merchant",
      label: "Every terminal linked to a merchant",
      ok: (readiness?.terminals.withoutMerchant ?? 0) === 0 && (readiness?.terminals.active ?? 0) > 0,
    },
  ];
}

export function ProviderCommercialTab({ id, providerCanonicalId, row, hasCommercialAccess }: Props) {
  const qc = useQueryClient();
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;

  const [paycloudDetailPaymentId, setPaycloudDetailPaymentId] = useState<string | null>(null);
  const [showYocoSupport, setShowYocoSupport] = useState(false);
  const [yocoSupportForm, setYocoSupportForm] = useState({
    environment: (row.yoco_summary?.integration?.environment ?? "live") as "live" | "sandbox",
    is_enabled: row.yoco_summary?.integration?.enabled ?? true,
    public_key: "",
    secret_key: "",
    webhook_secret: "",
    credential_mode: (row.yoco_summary?.integration?.credential_mode ?? "checkout") as "none" | "checkout" | "oauth",
    clear_checkout_credentials: false,
    reset_reconnect_banner: true,
  });

  const [noteBody, setNoteBody] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);

  const [profileDraft, setProfileDraft] = useState({
    terminal_ownership_status: str(row.terminal_profile?.terminal_ownership_status),
    terminal_provider: str(row.terminal_profile?.terminal_provider),
    terminal_count_range: str(row.terminal_profile?.terminal_count_range),
    interested_in_platform_terminal: str(row.terminal_profile?.interested_in_platform_terminal),
    terminal_provider_other: str(row.terminal_profile?.terminal_provider_other),
  });

  // Terminal profile (detailed, separate fetch for full data)
  const terminalProfileQ = useQuery({
    queryKey: adminQueryKeys.providers.terminalProfile(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<{ profile: Record<string, unknown> | null }>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/payment-terminal-profile`,
        { timeoutMs: 20_000 },
      ),
    enabled: hasCommercialAccess && !!providerCanonicalId,
  });

  // Terminal integrations (vendor connections)
  const terminalIntegrationsQ = useQuery({
    queryKey: adminQueryKeys.providers.terminalIntegrations(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<{ integrations: TerminalIntegrationRow[] }>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/terminal-integrations`,
        { timeoutMs: 20_000 },
      ),
    enabled: hasCommercialAccess && !!providerCanonicalId,
  });

  // Terminal notes
  const terminalNotesQ = useQuery({
    queryKey: adminQueryKeys.providers.terminalNotes(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<{ notes: TerminalNote[] }>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/terminal-notes`,
        { timeoutMs: 20_000 },
      ),
    enabled: hasCommercialAccess && !!providerCanonicalId,
  });

  // Paystack Virtual Terminals (superadmin only)
  const providerTerminalsQ = useQuery({
    queryKey: [...adminQueryKeys.finance.all(), "paystack-terminal-provider", providerCanonicalId],
    queryFn: () =>
      adminApi.getJson<{ items: Array<{ id: string; terminal_code: string; name: string; display_name?: string | null; status: string; asset_status?: string | null; destination_status?: string | null; last_payment_at?: string | null }> }>(
        `/api/admin/paystack-terminal/terminals?provider_id=${encodeURIComponent(providerCanonicalId)}&limit=10`,
        { timeoutMs: 30_000 },
      ),
    enabled: !!providerCanonicalId && isSuperadmin,
  });

  // PayCloud provider panel (superadmin only)
  const paycloudQ = useQuery({
    queryKey: adminQueryKeys.providers.paycloud(providerCanonicalId),
    queryFn: () =>
      adminApi.getJson<ProviderPaycloudResponse>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/paycloud`,
        { timeoutMs: 30_000 },
      ),
    enabled: !!providerCanonicalId && isSuperadmin,
  });

  const togglePaycloud = useMutation({
    mutationFn: (enabled: boolean) =>
      adminApi.patchJson<{ updated: boolean; readiness: PaycloudReadiness }>(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/paycloud`,
        { accept_paycloud: enabled },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.paycloud(providerCanonicalId) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      adminToast.success("PayCloud setting updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update PayCloud setting: ${e.message}`),
  });

  const forceSettlePaycloud = useMutation({
    mutationFn: (paymentId: string) =>
      adminApi.postJson<{ settled: boolean; reason?: string | null }>(
        `/api/admin/paycloud-operations/payments/${encodeURIComponent(paymentId)}/force-settle`,
        {},
      ),
    onSuccess: async (data) => {
      if (data.settled) {
        adminToast.success(data.reason ? `Payment settled (${data.reason})` : "Payment force-settled");
      } else {
        adminToast.error(data.reason ? `Settlement skipped: ${data.reason}` : "Settlement did not complete");
      }
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.paycloud(providerCanonicalId) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const paycloudMerchantsQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.merchants("active-100"),
    enabled: !!providerCanonicalId && isSuperadmin,
    queryFn: () =>
      adminApi.getJson<{ items: PaycloudMerchant[] }>(
        "/api/admin/paycloud-operations/merchants?limit=100&active_only=true",
        { timeoutMs: 30_000 },
      ),
  });

  const [paycloudAssignForm, setPaycloudAssignForm] = useState({
    terminal_sn: "",
    display_name: "",
    paycloud_merchant_id: "",
  });
  const [paycloudReassignTerminalId, setPaycloudReassignTerminalId] = useState<string | null>(null);
  const [paycloudReassignMerchantId, setPaycloudReassignMerchantId] = useState("");

  const assignPaycloudTerminal = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/paycloud-operations/terminals", {
        provider_id: providerCanonicalId,
        terminal_sn: paycloudAssignForm.terminal_sn.trim(),
        display_name: paycloudAssignForm.display_name.trim(),
        paycloud_merchant_id: paycloudAssignForm.paycloud_merchant_id,
      }),
    onSuccess: async () => {
      adminToast.success("Card machine assigned");
      setPaycloudAssignForm({ terminal_sn: "", display_name: "", paycloud_merchant_id: "" });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.paycloud(providerCanonicalId) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const paycloudTerminalAction = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.patchJson("/api/admin/paycloud-operations/terminals", body),
    onSuccess: async (_data, variables) => {
      adminToast.success(
        variables.action === "reassign" ? "Terminal reassigned" : "Terminal updated",
      );
      setPaycloudReassignTerminalId(null);
      setPaycloudReassignMerchantId("");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.paycloud(providerCanonicalId) });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.paycloudOperations.all() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const togglePaycloudSettings = useMutation({
    mutationFn: (body: { qr_payments_enabled?: boolean; cashback_enabled?: boolean }) =>
      adminApi.patchJson(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/paycloud`,
        body,
      ),
    onSuccess: async () => {
      adminToast.success("PayCloud settings updated");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.paycloud(providerCanonicalId) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const saveTerminalProfile = useMutation({
    mutationFn: () =>
      adminApi.putJson(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/payment-terminal-profile`,
        {
          terminal_ownership_status: profileDraft.terminal_ownership_status || null,
          terminal_provider: profileDraft.terminal_provider || null,
          terminal_count_range: profileDraft.terminal_count_range || null,
          interested_in_platform_terminal: profileDraft.interested_in_platform_terminal || null,
          terminal_provider_other: profileDraft.terminal_provider_other || null,
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.terminalProfile(providerCanonicalId) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      adminToast.success("Terminal profile saved");
    },
    onError: (e: Error) => adminToast.error(`Failed to save terminal profile: ${e.message}`),
  });

  const addNote = useMutation({
    mutationFn: () =>
      adminApi.postJson(
        `/api/admin/providers/${encodeURIComponent(providerCanonicalId)}/terminal-notes`,
        { body: noteBody.trim() },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.terminalNotes(providerCanonicalId) });
      setNoteBody("");
      setShowNoteForm(false);
      adminToast.success("Note added");
    },
    onError: (e: Error) => adminToast.error(`Failed to add note: ${e.message}`),
  });

  const updateYocoSupport = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        environment: yocoSupportForm.environment,
        is_enabled: yocoSupportForm.is_enabled,
        credential_mode: yocoSupportForm.credential_mode,
        clear_checkout_credentials: yocoSupportForm.clear_checkout_credentials,
        reset_reconnect_banner: yocoSupportForm.reset_reconnect_banner,
      };
      if (yocoSupportForm.public_key.trim()) payload.public_key = yocoSupportForm.public_key.trim();
      if (yocoSupportForm.secret_key.trim()) payload.secret_key = yocoSupportForm.secret_key.trim();
      if (yocoSupportForm.webhook_secret.trim()) payload.webhook_secret = yocoSupportForm.webhook_secret.trim();
      return adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}/yoco`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      setYocoSupportForm((f) => ({ ...f, public_key: "", secret_key: "", webhook_secret: "", clear_checkout_credentials: false }));
      adminToast.success("Yoco settings updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update Yoco settings: ${e.message}`),
  });

  const disconnectYocoOauth = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}/yoco`, {
        action: "disconnect_oauth",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      adminToast.success("Yoco OAuth disconnected");
    },
    onError: (e: Error) => adminToast.error(`Failed to disconnect Yoco OAuth: ${e.message}`),
  });

  const togglePaystackTerminal = useMutation({
    mutationFn: (enabled: boolean) =>
      adminApi.patchJson(`/api/admin/providers/${encodeURIComponent(providerCanonicalId || id)}`, {
        accept_paystack_terminal: enabled,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminQueryKeys.providers.detail(id) });
      adminToast.success("Paystack Terminal setting updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to update Paystack Terminal setting: ${e.message}`),
  });

  const yoco = row.yoco_summary;
  const yocoDerived = yoco?.derived ?? {};
  const paycloud = paycloudQ.data;
  const paycloudReadiness = paycloud?.readiness;
  const paycloudAccept =
    paycloud?.provider?.accept_paycloud ?? paycloudReadiness?.settings.accept ?? row.accept_paycloud;

  const STATUS_COLORS: Record<string, string> = {
    connected: "bg-green-100 text-green-800",
    pending_verification: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-800",
    suspended: "bg-gray-200 text-gray-700",
    not_connected: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-6">
      {/* ── Terminal profile ─────────────────────────────────────── */}
      {hasCommercialAccess && (
        <AdminPanel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Payment terminal profile</h2>
              <p className="mt-1 text-sm text-gray-600">
                Provider-declared card machine ownership and interest. Editable by Commercial Ops.
              </p>
            </div>
            <Link
              to={adminSpaTo("/admin/commercial/terminal-insights")}
              className="shrink-0 text-sm font-medium text-primary underline"
            >
              Terminal Insights →
            </Link>
          </div>

          {terminalProfileQ.isLoading ? (
            <p className="mt-4 text-sm text-gray-400">Loading profile…</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm">
                <span className="text-gray-600">Ownership status</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={profileDraft.terminal_ownership_status}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, terminal_ownership_status: e.target.value }))}
                >
                  <option value="">— not set —</option>
                  {Object.entries(OWNERSHIP_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">Terminal vendor</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={profileDraft.terminal_provider}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, terminal_provider: e.target.value }))}
                >
                  <option value="">— not set —</option>
                  {Object.entries(TERMINAL_VENDOR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">Count range</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={profileDraft.terminal_count_range}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, terminal_count_range: e.target.value }))}
                >
                  <option value="">— not set —</option>
                  <option value="one">1 device</option>
                  <option value="two_to_three">2–3 devices</option>
                  <option value="four_to_ten">4–10 devices</option>
                  <option value="more_than_ten">10+ devices</option>
                  <option value="unsure">Unsure</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">Interest in platform terminal</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={profileDraft.interested_in_platform_terminal}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, interested_in_platform_terminal: e.target.value }))}
                >
                  <option value="">— not set —</option>
                  <option value="yes">Yes</option>
                  <option value="maybe_later">Maybe later</option>
                  <option value="no">No</option>
                </select>
              </label>

              <label className="block text-sm sm:col-span-2">
                <span className="text-gray-600">Other vendor name (if "other" selected)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={profileDraft.terminal_provider_other}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, terminal_provider_other: e.target.value }))}
                  placeholder="e.g. Shopify POS, Square"
                />
              </label>
            </div>
          )}

          <button
            type="button"
            className={`mt-4 ${adminToolbarButtonClass(saveTerminalProfile.isPending)}`}
            disabled={saveTerminalProfile.isPending}
            onClick={() => void saveTerminalProfile.mutate()}
          >
            {saveTerminalProfile.isPending ? "Saving…" : "Save terminal profile"}
          </button>
        </AdminPanel>
      )}

      {/* ── Terminal vendor integrations ─────────────────────────── */}
      {hasCommercialAccess && (
        <AdminPanel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Terminal vendor integrations</h2>
              <p className="mt-1 text-sm text-gray-600">
                Connected card machine vendors (Wappoint, iKhokha, FNB, etc.) and active device counts.
              </p>
            </div>
            <Link
              to={adminSpaTo("/admin/commercial/terminal-vendors")}
              className="shrink-0 text-sm font-medium text-primary underline"
            >
              Vendor catalog →
            </Link>
          </div>

          {terminalIntegrationsQ.isLoading ? (
            <p className="mt-4 text-sm text-gray-400">Loading integrations…</p>
          ) : (terminalIntegrationsQ.data?.integrations ?? []).length === 0 ? (
            <EmptyState
              title="No vendor integrations connected"
              description="When the provider connects a card machine vendor, it appears here."
            />
          ) : (
            <AdminDataTable className="mt-4">
              <AdminTableHead>
                <tr>
                  <AdminTh>Vendor</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Mode</AdminTh>
                  <AdminTh>Env</AdminTh>
                  <AdminTh>Devices</AdminTh>
                  <AdminTh>Connected</AdminTh>
                  <AdminTh>Last sync</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {(terminalIntegrationsQ.data?.integrations ?? []).map((integ) => (
                  <tr key={integ.id} className="hover:bg-gray-50/60">
                    <AdminTd>
                      <span className="font-medium capitalize">
                        {TERMINAL_VENDOR_LABELS[integ.vendor ?? ""] ?? integ.vendor ?? "—"}
                      </span>
                      {integ.merchant_id && (
                        <p className="font-mono text-xs text-gray-400">{integ.merchant_id}</p>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[integ.status ?? "not_connected"] ?? STATUS_COLORS.not_connected)}>
                        {(integ.status ?? "not_connected").replace(/_/g, " ")}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-xs font-mono">{integ.credential_mode ?? "—"}</AdminTd>
                    <AdminTd className="text-xs">{integ.environment ?? "—"}</AdminTd>
                    <AdminTd>{integ.active_device_count ?? 0}</AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {integ.connected_at ? new Date(integ.connected_at).toLocaleDateString() : "—"}
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {integ.last_sync_at ? new Date(integ.last_sync_at).toLocaleDateString() : "—"}
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      )}

      {/* ── Commercial admin notes ───────────────────────────────── */}
      {hasCommercialAccess && (
        <AdminPanel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Commercial notes</h2>
              <p className="mt-1 text-sm text-gray-600">
                Internal notes on terminal follow-ups, intent, and outcomes. Visible to Commercial Ops only.
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => setShowNoteForm((v) => !v)}
            >
              {showNoteForm ? "Cancel" : "+ Add note"}
            </button>
          </div>

          {showNoteForm && (
            <div className="mt-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <textarea
                className="w-full min-h-[90px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                placeholder="Enter your note (e.g. follow-up outcome, terminal purchase intent)…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <button
                type="button"
                className={adminToolbarButtonClass(addNote.isPending)}
                disabled={addNote.isPending || !noteBody.trim()}
                onClick={() => void addNote.mutate()}
              >
                {addNote.isPending ? "Saving…" : "Save note"}
              </button>
            </div>
          )}

          {terminalNotesQ.isLoading ? (
            <p className="mt-4 text-sm text-gray-400">Loading notes…</p>
          ) : (terminalNotesQ.data?.notes ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No notes yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(terminalNotesQ.data?.notes ?? []).map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-sm"
                >
                  <p className="text-gray-900">{note.body}</p>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {note.users?.full_name ?? note.users?.email ?? "Admin"} ·{" "}
                    {note.created_at ? new Date(note.created_at).toLocaleString() : "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      )}

      {/* ── Yoco integration ─────────────────────────────────────── */}
      <AdminPanel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Yoco terminals &amp; integration</h2>
            <p className="mt-1 text-sm text-gray-600">
              Operational view from stored rows — not a live Yoco ping. Web POS requires OAuth; dashboard keys are checkout-only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={adminSpaTo("/admin/integrations/yoco")}
              className="shrink-0 text-sm font-medium text-primary underline"
            >
              Yoco setup →
            </Link>
            {isSuperadmin ? (
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setShowYocoSupport((v) => !v)}
              >
                {showYocoSupport ? "Hide support controls" : "Support controls"}
              </button>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Integration record", value: yoco?.integration ? "Yes" : "No" },
            { label: "Integration enabled", value: yoco?.integration?.enabled ? "Yes" : "No" },
            { label: "Credential mode", value: yoco?.integration?.credential_mode ?? "none" },
            { label: "Environment", value: yoco?.integration?.environment ?? "live" },
            { label: "Has public key", value: yoco?.integration?.has_public_key ? "Yes" : "No" },
            { label: "OAuth token", value: yoco?.integration?.oauth_token_present ? "Present" : "Not stored" },
            { label: "OAuth business", value: yoco?.integration?.oauth_token?.business_name ?? yoco?.integration?.oauth_token?.business_id ?? "—" },
            { label: "OAuth expires", value: yoco?.integration?.oauth_token?.expires_at ? new Date(String(yoco.integration.oauth_token.expires_at)).toLocaleString() : "—" },
            { label: "Web POS devices", value: String(Array.isArray(yoco?.web_pos_devices) ? yoco!.web_pos_devices!.length : 0) },
            { label: "Legacy terminals", value: String(Array.isArray(yoco?.legacy_terminals) ? yoco!.legacy_terminals!.length : 0) },
            { label: "Connected", value: yoco?.integration?.connected_at ? new Date(String(yoco.integration.connected_at)).toLocaleString() : "—" },
            { label: "Last sync", value: yoco?.integration?.last_sync ? new Date(String(yoco.integration.last_sync)).toLocaleString() : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-gray-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-gray-500">Likely ready for terminal payments</dt>
            <dd className="font-medium">{yocoDerived.likely_ready_for_terminal_payments ? "Yes" : "No"}</dd>
            {yocoDerived.has_virtual_checkout_devices_only ? (
              <p className="mt-1 text-xs text-amber-700">
                Active devices look like hosted-checkout placeholders — provider needs <strong>Connect Yoco (OAuth)</strong> for real Web POS terminals.
              </p>
            ) : null}
            {yoco?.integration?.oauth_token?.last_refresh_error ? (
              <p className="mt-1 text-xs text-red-700">OAuth error: {yoco.integration.oauth_token.last_refresh_error}</p>
            ) : null}
          </div>
        </dl>

        {isSuperadmin && showYocoSupport ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-950">Superadmin Yoco support controls</h3>
            <p className="mt-1 text-sm text-amber-900">
              Audited support recovery only. Providers should normally self-connect via OAuth.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Environment
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={yocoSupportForm.environment}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, environment: e.target.value === "sandbox" ? "sandbox" : "live" }))}
                >
                  <option value="live">live</option>
                  <option value="sandbox">sandbox</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                Credential mode
                <select
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={yocoSupportForm.credential_mode}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, credential_mode: e.target.value as "none" | "checkout" | "oauth" }))}
                >
                  <option value="none">none</option>
                  <option value="checkout">checkout</option>
                  <option value="oauth">oauth</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={yocoSupportForm.is_enabled}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, is_enabled: e.target.checked }))} />
                Integration enabled
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={yocoSupportForm.reset_reconnect_banner}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, reset_reconnect_banner: e.target.checked }))} />
                Reset reconnect banner
              </label>
              <label className="text-sm font-medium text-gray-700">
                Public key (optional)
                <input className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm"
                  value={yocoSupportForm.public_key}
                  placeholder={yoco?.integration?.has_public_key ? "Set (hidden)" : "pk_live_..."}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, public_key: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Secret key
                <input type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm"
                  value={yocoSupportForm.secret_key}
                  placeholder={yoco?.integration?.has_secret_key ? "Set (hidden)" : "sk_live_..."}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, secret_key: e.target.value }))} />
              </label>
              <label className="text-sm font-medium text-gray-700 md:col-span-2">
                Webhook secret
                <input type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm"
                  value={yocoSupportForm.webhook_secret} placeholder="whsec_..."
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, webhook_secret: e.target.value }))} />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-red-800 md:col-span-2">
                <input type="checkbox" checked={yocoSupportForm.clear_checkout_credentials}
                  onChange={(e) => setYocoSupportForm((f) => ({ ...f, clear_checkout_credentials: e.target.checked }))} />
                Clear hosted checkout credentials
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button"
                className={adminToolbarButtonClass(updateYocoSupport.isPending)}
                disabled={updateYocoSupport.isPending}
                onClick={() => updateYocoSupport.mutate()}
              >
                {updateYocoSupport.isPending ? "Saving…" : "Save Yoco settings"}
              </button>
              <button type="button"
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={disconnectYocoOauth.isPending || !yoco?.integration?.oauth_token_present}
                onClick={() => {
                  if (window.confirm("Disconnect Yoco OAuth tokens? Provider must reconnect for Web POS.")) {
                    disconnectYocoOauth.mutate();
                  }
                }}
              >
                {disconnectYocoOauth.isPending ? "Disconnecting…" : "Disconnect OAuth tokens"}
              </button>
            </div>
          </div>
        ) : null}

        {Array.isArray(yoco?.web_pos_devices) && yoco!.web_pos_devices!.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Yoco device ID</th>
                  <th className="py-2 pr-3 font-medium">Mode</th>
                  <th className="py-2 pr-3 font-medium">Active</th>
                  <th className="py-2 pr-3 font-medium">Last used</th>
                </tr>
              </thead>
              <tbody>
                {yoco!.web_pos_devices!.map((d) => (
                  <tr key={str(d.id)} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{str(d.name)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{str(d.yoco_device_id)}</td>
                    <td className="py-2 pr-3 text-xs">{str(d.credential_mode) || "—"}</td>
                    <td className="py-2 pr-3">{d.is_active === false ? "No" : "Yes"}</td>
                    <td className="py-2 pr-3 text-xs text-gray-500">
                      {d.last_used ? new Date(String(d.last_used)).toLocaleString() : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminPanel>

      {/* ── PayCloud card machines ─────────────────────────────────── */}
      <AdminPanel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">PayCloud card machines</h2>
            <p className="mt-1 text-sm text-gray-600">
              Beautonomi in-person card terminals via PayCloud / WiseCashier Cloud Mode. Feature flag{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">payment_paycloud</code> must be enabled for the market.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={adminSpaTo("/admin/integrations/paycloud")}
              className="shrink-0 text-sm font-medium text-primary underline"
            >
              PayCloud setup →
            </Link>
            <Link
              to={adminSpaTo("/admin/integrations/paycloud-operations")}
              className="shrink-0 text-sm font-medium text-primary underline"
            >
              Operations →
            </Link>
          </div>
        </div>

        {!isSuperadmin ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Accept PayCloud</dt>
              <dd className="font-medium">
                {row.accept_paycloud ? (
                  <span className="text-emerald-700">Enabled</span>
                ) : (
                  <span className="text-gray-500">Disabled</span>
                )}
              </dd>
            </div>
          </dl>
        ) : paycloudQ.isLoading ? (
          <p className="mt-4 text-sm text-gray-400">Loading PayCloud status…</p>
        ) : paycloudQ.error ? (
          <p className="mt-4 text-sm text-red-700">
            Failed to load PayCloud status: {(paycloudQ.error as Error).message}
          </p>
        ) : paycloud ? (
          <>
            {/* Readiness banner */}
            {paycloudReadiness?.ready ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-medium text-emerald-900">Ready for in-person card payments</p>
                <p className="mt-1 text-xs text-emerald-800">
                  {paycloudReadiness.terminals.active} active terminal
                  {paycloudReadiness.terminals.active === 1 ? "" : "s"}
                  {paycloudReadiness.terminals.inFlight > 0
                    ? ` · ${paycloudReadiness.terminals.inFlight} in-flight`
                    : ""}
                </p>
              </div>
            ) : paycloudReadiness?.blockers?.[0] ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-amber-950">
                      Blocked: {paycloudReadiness.blockers[0].title}
                    </p>
                    <p className="mt-1 text-xs text-amber-900">
                      {paycloudReadiness.blockers[0].actionLabel}
                      {paycloudReadiness.blockers.length > 1
                        ? ` · +${paycloudReadiness.blockers.length - 1} more blocker${paycloudReadiness.blockers.length > 2 ? "s" : ""}`
                        : ""}
                    </p>
                  </div>
                  {paycloudReadiness.blockers[0].code === "NOT_ACCEPTED" ? (
                    <button
                      type="button"
                      className={adminToolbarButtonClass(togglePaycloud.isPending)}
                      disabled={togglePaycloud.isPending}
                      onClick={() => togglePaycloud.mutate(true)}
                    >
                      Enable PayCloud
                    </button>
                  ) : paycloudReadiness.blockers[0].code === "FLAG_OFF" ? (
                    <Link
                      to={adminSpaTo("/admin/settings/feature-flags")}
                      className={adminToolbarButtonClass(false) + " inline-flex"}
                    >
                      Open feature flags
                    </Link>
                  ) : paycloudReadiness.blockers[0].code === "NO_MERCHANT" ? (
                    <a href="#paycloud-terminals" className={adminToolbarButtonClass(false) + " inline-flex"}>
                      Link merchant on terminal
                    </a>
                  ) : paycloudReadiness.blockers[0].code === "NO_TERMINALS" ? (
                    <a href="#paycloud-assign" className={adminToolbarButtonClass(false) + " inline-flex"}>
                      Assign machine
                    </a>
                  ) : paycloudReadiness.blockers[0].code === "PLAN_REQUIRED" ? (
                    <Link
                      to={adminSpaTo(
                        `/admin/providers/${encodeURIComponent(providerCanonicalId || id)}?tab=finance`,
                      )}
                      className={adminToolbarButtonClass(false) + " inline-flex"}
                    >
                      Open provider subscription
                    </Link>
                  ) : paycloudReadiness.blockers[0].code === "ALL_SUSPENDED" ? (
                    <a href="#paycloud-terminals" className={adminToolbarButtonClass(false) + " inline-flex"}>
                      Review terminals
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {paycloudChecklistItems(paycloudReadiness).map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    item.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-950",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-2 w-2 shrink-0 rounded-full",
                      item.ok ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  {item.label}
                </li>
              ))}
            </ul>

            {paycloudReadiness?.warnings && paycloudReadiness.warnings.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {paycloudReadiness.warnings.map((w) => (
                  <li key={w.code} className="text-xs text-amber-800">
                    {w.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Accept toggle + summary stats */}
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt className="text-gray-500">Accept PayCloud</dt>
                  <dd className="font-medium">
                    {paycloudAccept ? (
                      <span className="text-emerald-700">Enabled</span>
                    ) : (
                      <span className="text-gray-500">Disabled</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Account environment</dt>
                  <dd className="font-medium capitalize">
                    {paycloudReadiness?.account_environment ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Active terminals</dt>
                  <dd className="font-medium">{paycloudReadiness?.terminals.active ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Suspended / inactive</dt>
                  <dd className="font-medium">{paycloudReadiness?.terminals.suspended ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Plan terminals</dt>
                  <dd className="font-medium">
                    {paycloudReadiness?.plan
                      ? `${paycloudReadiness.plan.usedTerminals}${paycloudReadiness.plan.maxTerminals != null ? ` / ${paycloudReadiness.plan.maxTerminals}` : ""}`
                      : "—"}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className={adminToolbarButtonClass(togglePaycloud.isPending)}
                disabled={togglePaycloud.isPending}
                onClick={() => togglePaycloud.mutate(!paycloudAccept)}
              >
                {togglePaycloud.isPending
                  ? "Saving…"
                  : paycloudAccept
                    ? "Disable PayCloud"
                    : "Enable PayCloud"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={paycloudReadiness?.settings.qr === true}
                  disabled={togglePaycloudSettings.isPending}
                  onChange={(e) =>
                    togglePaycloudSettings.mutate({ qr_payments_enabled: e.target.checked })
                  }
                />
                <span>QR wallet payments (support override)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={paycloudReadiness?.settings.cashback === true}
                  disabled={togglePaycloudSettings.isPending}
                  onChange={(e) =>
                    togglePaycloudSettings.mutate({ cashback_enabled: e.target.checked })
                  }
                />
                <span>Cashback on terminal sales (support override)</span>
              </label>
            </div>

            {/* Merchant strip */}
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Merchants on this provider</h3>
                <Link
                  to={adminSpaTo("/admin/integrations/paycloud")}
                  className="text-xs font-medium text-primary underline"
                >
                  Add / edit merchants →
                </Link>
              </div>
              {(paycloud.merchants ?? []).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {paycloud.merchants.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-gray-900">{m.label}</p>
                      <p className="font-mono text-xs text-gray-500">
                        {m.merchant_no} / {m.store_no}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-gray-600">{m.environment}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  No merchants linked via terminals yet. Register merchants on{" "}
                  <Link to={adminSpaTo("/admin/integrations/paycloud")} className="text-primary underline">
                    PayCloud setup
                  </Link>
                  , then assign a terminal below.
                </p>
              )}
            </div>

            {/* Assign terminal */}
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4" id="paycloud-assign">
              <h3 className="text-sm font-semibold text-gray-900">Assign card machine</h3>
              <p className="mt-1 text-xs text-gray-600">
                Requires an active PayCloud merchant. Create or edit merchants on{" "}
                <Link to={adminSpaTo("/admin/integrations/paycloud")} className="text-primary underline">
                  PayCloud setup
                </Link>
                .
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Merchant</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    value={paycloudAssignForm.paycloud_merchant_id}
                    onChange={(e) =>
                      setPaycloudAssignForm((f) => ({ ...f, paycloud_merchant_id: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {(paycloudMerchantsQ.data?.items ?? paycloud.merchants ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatPaycloudMerchantOptionLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Serial</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono"
                    value={paycloudAssignForm.terminal_sn}
                    onChange={(e) =>
                      setPaycloudAssignForm((f) => ({ ...f, terminal_sn: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Name</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    value={paycloudAssignForm.display_name}
                    onChange={(e) =>
                      setPaycloudAssignForm((f) => ({ ...f, display_name: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className={adminToolbarButtonClass(assignPaycloudTerminal.isPending)}
                    disabled={
                      assignPaycloudTerminal.isPending ||
                      !paycloudAssignForm.paycloud_merchant_id ||
                      !paycloudAssignForm.terminal_sn.trim() ||
                      !paycloudAssignForm.display_name.trim()
                    }
                    onClick={() => assignPaycloudTerminal.mutate()}
                  >
                    {assignPaycloudTerminal.isPending ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            </div>

            {/* Terminals table */}
            <div id="paycloud-terminals">
            {(paycloud.terminals ?? []).length > 0 ? (
              <AdminDataTable className="mt-6">
                <AdminTableHead>
                  <tr>
                    <AdminTh>Name</AdminTh>
                    <AdminTh>Serial</AdminTh>
                    <AdminTh>Merchant / store / env</AdminTh>
                    <AdminTh>Location</AdminTh>
                    <AdminTh>Status</AdminTh>
                    <AdminTh>In-flight</AdminTh>
                    <AdminTh>Last used</AdminTh>
                    <AdminTh>Last error</AdminTh>
                    <AdminTh>Actions</AdminTh>
                  </tr>
                </AdminTableHead>
                <AdminTableBody>
                  {paycloud.terminals.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50/60">
                      <AdminTd>{t.display_name}</AdminTd>
                      <AdminTd className="font-mono text-xs">{t.terminal_sn}</AdminTd>
                      <AdminTd>
                        {t.merchant ? (
                          <div className="text-xs">
                            <div>{t.merchant.label}</div>
                            <div className="font-mono text-gray-500">
                              {t.merchant.merchant_no} / {t.merchant.store_no}
                            </div>
                            <div className="capitalize text-gray-600">{t.merchant.environment}</div>
                          </div>
                        ) : (
                          <span className="text-amber-700">No merchant</span>
                        )}
                      </AdminTd>
                      <AdminTd>{t.location?.name ?? "Portable"}</AdminTd>
                      <AdminTd>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            paycloudStatusClass(t.status),
                          )}
                        >
                          {t.status.replace(/_/g, " ")}
                        </span>
                      </AdminTd>
                      <AdminTd>
                        {t.in_flight_payment_id ? (
                          <Link
                            to={adminSpaTo(
                              `/admin/integrations/paycloud-operations?search=${encodeURIComponent(t.in_flight_payment_id)}&exceptions_only=false`,
                            )}
                            className="text-xs font-mono text-amber-700 underline"
                            title={t.in_flight_payment_id}
                          >
                            {t.in_flight_payment_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </AdminTd>
                      <AdminTd className="whitespace-nowrap text-xs text-gray-600">
                        {t.last_used_at
                          ? new Date(t.last_used_at).toLocaleString()
                          : "—"}
                      </AdminTd>
                      <AdminTd className="max-w-[200px] truncate text-xs text-red-700" title={t.last_error ?? undefined}>
                        {t.last_error ?? "—"}
                      </AdminTd>
                      <AdminTd>
                        <div className="flex flex-wrap gap-1">
                          {t.status === "suspended" ? (
                            <button
                              type="button"
                              className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                              disabled={paycloudTerminalAction.isPending}
                              onClick={() =>
                                paycloudTerminalAction.mutate({ action: "unsuspend", terminal_id: t.id })
                              }
                            >
                              Unsuspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                              disabled={paycloudTerminalAction.isPending}
                              onClick={() =>
                                paycloudTerminalAction.mutate({ action: "suspend", terminal_id: t.id })
                              }
                            >
                              Suspend
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                            disabled={paycloudTerminalAction.isPending}
                            onClick={() => {
                              setPaycloudReassignTerminalId(t.id);
                              setPaycloudReassignMerchantId(t.merchant?.id ?? "");
                            }}
                          >
                            Reassign merchant
                          </button>
                          <button
                            type="button"
                            className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                            disabled={paycloudTerminalAction.isPending}
                            onClick={() => {
                              if (window.confirm(`Unassign ${t.display_name}?`)) {
                                paycloudTerminalAction.mutate({ action: "unassign", terminal_id: t.id });
                              }
                            }}
                          >
                            Unassign
                          </button>
                        </div>
                        {paycloudReassignTerminalId === t.id ? (
                          <div className="mt-2 space-y-2 rounded border border-gray-200 bg-white p-2">
                            <select
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                              value={paycloudReassignMerchantId}
                              onChange={(e) => setPaycloudReassignMerchantId(e.target.value)}
                            >
                              <option value="">Select merchant…</option>
                              {(paycloudMerchantsQ.data?.items ?? []).map((m) => (
                                <option key={m.id} value={m.id}>
                                  {formatPaycloudMerchantOptionLabel(m)}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                                disabled={
                                  paycloudTerminalAction.isPending || !paycloudReassignMerchantId
                                }
                                onClick={() =>
                                  paycloudTerminalAction.mutate({
                                    action: "reassign",
                                    terminal_id: t.id,
                                    provider_id: providerCanonicalId,
                                    paycloud_merchant_id: paycloudReassignMerchantId,
                                  })
                                }
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                                onClick={() => {
                                  setPaycloudReassignTerminalId(null);
                                  setPaycloudReassignMerchantId("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </AdminTd>
                    </tr>
                  ))}
                </AdminTableBody>
              </AdminDataTable>
            ) : (
              <div className="mt-6">
                <EmptyState
                  title="No PayCloud terminals"
                  description="Assign a card machine above, or manage the fleet from PayCloud Operations."
                />
              </div>
            )}
            </div>

            {/* Recent payments */}
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Recent payments</h3>
                <Link
                  to={adminSpaTo(
                    `/admin/integrations/paycloud-operations?provider_id=${encodeURIComponent(providerCanonicalId)}&exceptions_only=false`,
                  )}
                  className="text-xs font-medium text-primary underline"
                >
                  View all in Operations →
                </Link>
              </div>
              {(paycloud.recent_payments ?? []).length > 0 ? (
                <AdminDataTable className="mt-3">
                  <AdminTableHead>
                    <tr>
                      <AdminTh>Created</AdminTh>
                      <AdminTh>Order</AdminTh>
                      <AdminTh>Amount</AdminTh>
                      <AdminTh>Expected</AdminTh>
                      <AdminTh>Match</AdminTh>
                      <AdminTh>Status</AdminTh>
                      <AdminTh>Entity</AdminTh>
                      <AdminTh>Actions</AdminTh>
                    </tr>
                  </AdminTableHead>
                  <AdminTableBody>
                    {paycloud.recent_payments.map((payment) => {
                      const canForceSettle =
                        payment.status === "successful" && payment.amount_match_status !== "exact";
                      return (
                        <tr key={payment.id} className="hover:bg-gray-50/60">
                          <AdminTd className="whitespace-nowrap text-xs text-gray-600">
                            {new Date(payment.created_at).toLocaleString()}
                          </AdminTd>
                          <AdminTd className="font-mono text-xs">{payment.merchant_order_no}</AdminTd>
                          <AdminTd>{paycloudMoney(payment.amount)}</AdminTd>
                          <AdminTd>{paycloudMoney(payment.expected_amount)}</AdminTd>
                          <AdminTd>
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                paycloudStatusClass(payment.amount_match_status),
                              )}
                            >
                              {payment.amount_match_status.replace(/_/g, " ")}
                            </span>
                          </AdminTd>
                          <AdminTd>
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                paycloudStatusClass(payment.status),
                              )}
                            >
                              {payment.status.replace(/_/g, " ")}
                            </span>
                          </AdminTd>
                          <AdminTd>
                            <div className="text-xs text-gray-800">{payment.entity_type}</div>
                            <div className="font-mono text-xs text-gray-500">{payment.entity_id}</div>
                          </AdminTd>
                          <AdminTd>
                            <div className="flex flex-col items-start gap-1.5">
                              <button
                                type="button"
                                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                                onClick={() => setPaycloudDetailPaymentId(payment.id)}
                              >
                                View detail
                              </button>
                              {canForceSettle ? (
                                <button
                                  type="button"
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                  disabled={forceSettlePaycloud.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Force-settle ${paycloudMoney(payment.amount)} for ${payment.entity_type} ${payment.entity_id}?`,
                                      )
                                    ) {
                                      forceSettlePaycloud.mutate(payment.id);
                                    }
                                  }}
                                >
                                  Force settle
                                </button>
                              ) : null}
                            </div>
                          </AdminTd>
                        </tr>
                      );
                    })}
                  </AdminTableBody>
                </AdminDataTable>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No recent PayCloud payments.</p>
              )}
            </div>
          </>
        ) : null}
      </AdminPanel>

      {/* ── Paystack Virtual Terminal ─────────────────────────────── */}
      <AdminPanel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Paystack Virtual Terminal</h2>
            <p className="mt-1 text-sm text-gray-600">
              In-person QR / payment-link terminal payments via Paystack. Feature flag{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">payment_paystack_virtual_terminal</code>{" "}
              must also be enabled for the market.
            </p>
          </div>
          <Link
            to={adminSpaTo("/admin/paystack-terminal")}
            className="shrink-0 text-sm font-medium text-primary underline"
          >
            Terminal ops →
          </Link>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Accept Paystack Terminal</dt>
            <dd className="font-medium">
              {row.accept_paystack_terminal ? (
                <span className="text-emerald-700">Enabled</span>
              ) : (
                <span className="text-gray-500">Disabled</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Terminals registered</dt>
            <dd className="font-medium">
              {isSuperadmin
                ? providerTerminalsQ.isLoading ? "Loading…" : (providerTerminalsQ.data?.items?.length ?? 0)
                : "—"}
            </dd>
          </div>
        </dl>

        {isSuperadmin ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={adminToolbarButtonClass(togglePaystackTerminal.isPending)}
              disabled={togglePaystackTerminal.isPending}
              onClick={() => togglePaystackTerminal.mutate(!row.accept_paystack_terminal)}
            >
              {togglePaystackTerminal.isPending
                ? "Saving…"
                : row.accept_paystack_terminal
                  ? "Disable terminal payments"
                  : "Enable terminal payments"}
            </button>
          </div>
        ) : null}

        {isSuperadmin && providerTerminalsQ.data?.items && providerTerminalsQ.data.items.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-3 font-medium">Terminal</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Assets</th>
                  <th className="py-2 pr-3 font-medium">WhatsApp</th>
                  <th className="py-2 pr-3 font-medium">Last payment</th>
                </tr>
              </thead>
              <tbody>
                {providerTerminalsQ.data.items.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{t.display_name || t.name}</p>
                      <p className="font-mono text-xs text-gray-500">{t.terminal_code}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        t.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-gray-100 text-gray-700")}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        t.asset_status === "ready" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900")}>
                        {(t.asset_status ?? "missing_assets").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        t.destination_status === "configured" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900")}>
                        {(t.destination_status ?? "not_configured").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {t.last_payment_at ? new Date(t.last_payment_at).toLocaleString() : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(providerTerminalsQ.data?.items?.length ?? 0) >= 10 && (
              <p className="mt-2 text-xs text-gray-500">Showing first 10 — see Terminal ops for full list.</p>
            )}
          </div>
        ) : isSuperadmin && providerTerminalsQ.data?.items?.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No Paystack Virtual Terminals registered yet.</p>
        ) : null}
      </AdminPanel>

      {paycloudDetailPaymentId ? (
        <PaycloudPaymentDetailModal
          paymentId={paycloudDetailPaymentId}
          onClose={() => setPaycloudDetailPaymentId(null)}
        />
      ) : null}
    </div>
  );
}

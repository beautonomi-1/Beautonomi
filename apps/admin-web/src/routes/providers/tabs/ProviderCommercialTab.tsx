import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { ProviderDetail, str, OWNERSHIP_STATUS_LABELS, TERMINAL_VENDOR_LABELS } from "./types";

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

export function ProviderCommercialTab({ id, providerCanonicalId, row, hasCommercialAccess }: Props) {
  const qc = useQueryClient();
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;

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
    </div>
  );
}

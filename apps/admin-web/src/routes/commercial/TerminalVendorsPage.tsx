import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, ExternalLink, Settings, Plus } from "lucide-react";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type VendorConfig = {
  id: string;
  vendor: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  credential_modes: string[];
  requires_merchant_id: boolean;
  feature_flag_key: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_authorize_url: string | null;
  api_docs_url: string | null;
  help_url: string | null;
};

type VendorDetailResponse = { vendor: VendorConfig; stats: { connected_providers: number } };

const CREDENTIAL_MODE_LABELS: Record<string, string> = {
  api_key: "API key",
  oauth: "OAuth 2.0",
  manual: "Manual",
};

export function TerminalVendorsPage() {
  useAdminDocumentTitle("Terminal Vendors");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  const queryClient = useQueryClient();

  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<VendorConfig> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    vendor: "",
    display_name: "",
    description: "",
    credential_modes: ["api_key"] as string[],
    enabled: false,
  });

  // ── List query ──────────────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: adminQueryKeys.commercialTerminalVendors,
    queryFn: () =>
      adminApi.getJson<{ vendors: VendorConfig[] }>("/api/admin/commercial/terminal-vendors"),
    enabled: allowed,
    retry: false,
  });

  // ── Per-vendor detail query (for stats) ─────────────────────────────────────
  const { data: selectedData } = useQuery({
    queryKey: [...adminQueryKeys.commercialTerminalVendors, selectedVendor],
    queryFn: () =>
      adminApi.getJson<VendorDetailResponse>(
        `/api/admin/commercial/terminal-vendors/${selectedVendor}`,
      ),
    enabled: allowed && !!selectedVendor,
    retry: false,
  });

  // ── Toggle enabled mutation ─────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: ({ vendor, enabled }: { vendor: string; enabled: boolean }) =>
      adminApi.patchJson(`/api/admin/commercial/terminal-vendors/${vendor}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalVendors });
    },
    onError: (err: Error) =>
      adminToast.error(err.message || "Failed to toggle vendor"),
  });

  // ── Save config mutation ────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: ({ vendor, body }: { vendor: string; body: Partial<VendorConfig> }) =>
      adminApi.patchJson(`/api/admin/commercial/terminal-vendors/${vendor}`, body),
    onSuccess: () => {
      adminToast.success("Vendor configuration saved");
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalVendors });
      setEditForm(null);
      setSelectedVendor(null);
    },
    onError: (err: Error) =>
      adminToast.error(err.message || "Failed to save vendor config"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/commercial/terminal-vendors", {
        vendor: addForm.vendor.trim().toLowerCase(),
        display_name: addForm.display_name.trim(),
        description: addForm.description.trim() || null,
        credential_modes: addForm.credential_modes,
        enabled: addForm.enabled,
      }),
    onSuccess: () => {
      adminToast.success("Vendor created");
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalVendors });
      setAddOpen(false);
      setAddForm({ vendor: "", display_name: "", description: "", credential_modes: ["api_key"], enabled: false });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create vendor"),
  });

  // ── Auth / loading guards ───────────────────────────────────────────────────
  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) {
    if (isAdminApiAuthFailure(error)) return denied;
    return <AdminRetryBlock message="Failed to load terminal vendors" onRetry={() => refetch()} />;
  }

  const vendors = data?.vendors ?? [];

  function openEdit(v: VendorConfig) {
    setSelectedVendor(v.vendor);
    setEditForm({
      enabled: v.enabled,
      display_name: v.display_name,
      description: v.description ?? "",
      api_docs_url: v.api_docs_url ?? "",
      help_url: v.help_url ?? "",
      oauth_client_id: v.oauth_client_id ?? "",
    });
  }

  function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVendor || !editForm) return;
    saveMut.mutate({ vendor: selectedVendor, body: editForm });
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Vendors"
        description="Configure which card machine and payment terminal vendors providers can integrate. Enable a vendor and set its credentials — providers connect via their Settings → Sales page."
        actions={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Add vendor
          </button>
        }
      />

      {/* ── Vendor catalog table ─────────────────────────────────────────── */}
      <AdminPanel>
        {vendors.length === 0 ? (
          <EmptyState
            title="No vendors configured"
            description="Vendors are seeded by migration 757. Check your database migrations."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Vendor</AdminTh>
                <AdminTh>Credential modes</AdminTh>
                <AdminTh>Feature flag</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {vendors.map((v) => (
                <tr key={v.vendor} className="hover:bg-gray-50">
                  <AdminTd>
                    <div>
                      <p className="font-medium text-gray-900">{v.display_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{v.vendor}</p>
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {(v.credential_modes ?? []).map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600"
                        >
                          {CREDENTIAL_MODE_LABELS[m] ?? m}
                        </span>
                      ))}
                    </div>
                  </AdminTd>
                  <AdminTd>
                    {v.feature_flag_key ? (
                      <span className="font-mono text-xs text-gray-500">{v.feature_flag_key}</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <button
                      onClick={() =>
                        toggleMut.mutate({ vendor: v.vendor, enabled: !v.enabled })
                      }
                      disabled={toggleMut.isPending}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                        v.enabled
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {v.enabled ? (
                        <><CheckCircle2 className="h-3 w-3" />Enabled</>
                      ) : (
                        <><XCircle className="h-3 w-3" />Disabled</>
                      )}
                    </button>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(v)}
                        className={adminToolbarButtonClass()}
                        title="Configure vendor"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Configure
                      </button>
                      {v.api_docs_url && (
                        <a
                          href={v.api_docs_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={adminToolbarButtonClass()}
                          title="View API docs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {/* ── Vendor config panel ──────────────────────────────────────────── */}
      {selectedVendor && editForm && (
        <AdminPanel>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Configure: {vendors.find((v) => v.vendor === selectedVendor)?.display_name ?? selectedVendor}
          </h2>
          <div className="mb-4 p-3 rounded-lg bg-blue-50 text-sm text-blue-700">
            <p>
              <strong>Connected providers:</strong>{" "}
              {selectedData?.stats?.connected_providers ?? "—"}
            </p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={editForm.display_name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OAuth client ID
                <span className="text-gray-400 font-normal ml-1">(leave blank if not OAuth)</span>
              </label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                value={editForm.oauth_client_id ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, oauth_client_id: e.target.value || null }))}
                placeholder="client_id_..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OAuth client secret
                <span className="text-gray-400 font-normal ml-1">(redacted on read)</span>
              </label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, oauth_client_secret: e.target.value || null }))
                }
                placeholder="Enter new secret to update"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API docs URL</label>
              <input
                type="url"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={editForm.api_docs_url ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, api_docs_url: e.target.value || null }))}
                placeholder="https://docs.vendor.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Help / connect URL</label>
              <input
                type="url"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={editForm.help_url ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, help_url: e.target.value || null }))}
                placeholder="https://help.vendor.com/connect"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={editForm.enabled ?? false}
                onChange={(e) => setEditForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                Enable this vendor (allows providers to connect)
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saveMut.isPending ? "Saving…" : "Save vendor config"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedVendor(null);
                  setEditForm(null);
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Post-enable checklist */}
          <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-800">
            <p className="font-medium mb-1">After enabling a vendor:</p>
            <ol className="list-decimal ml-4 space-y-1 text-xs">
              <li>
                Enable the matching feature flag (
                <code className="font-mono">
                  {vendors.find((v) => v.vendor === selectedVendor)?.feature_flag_key ??
                    "terminal_vendor_X_enabled"}
                </code>
                ) in{" "}
                <a
                  href="/admin/settings/feature-flags"
                  className="underline text-amber-700"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Feature Flags
                </a>
                .
              </li>
              <li>
                Providers will see the vendor in their Terminal Integrations hub under Settings → Sales.
              </li>
              <li>Monitor connections in the Terminal Insights page.</li>
            </ol>
          </div>
        </AdminPanel>
      )}

      <AdminModal
        open={addOpen}
        title="Add terminal vendor"
        onClose={() => setAddOpen(false)}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setAddOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={createMut.isPending || !addForm.vendor.trim() || !addForm.display_name.trim()}
              onClick={() => createMut.mutate()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating…" : "Create vendor"}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Vendor key (snake_case)</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
              value={addForm.vendor}
              onChange={(e) => setAddForm((f) => ({ ...f, vendor: e.target.value }))}
              placeholder="my_vendor"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Display name</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={addForm.display_name}
              onChange={(e) => setAddForm((f) => ({ ...f, display_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={2}
              value={addForm.description}
              onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
  AdminTd,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";

interface TaxRate {
  id: string;
  code: string;
  name: string;
  description?: string;
  display_order?: number;
  metadata?: { rate?: number; included?: boolean; provider_tax_rate?: number };
}

type TaxesPayload = {
  tax_rates: TaxRate[];
  statistics?: Record<string, number>;
  /** Platform-wide default provider tax rate (fallback when provider has no explicit rate). */
  provider_tax_rate?: number | null;
  /** Platform default tax rate from platform_settings.settings.taxes.default_tax_rate */
  default_tax_rate?: number | null;
};

function RateForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<TaxRate>;
  onSave: (d: Partial<TaxRate>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [code, setCode] = useState(initial.code ?? "");
  const [name, setName] = useState(initial.name ?? "");
  const [desc, setDesc] = useState(initial.description ?? "");
  const [rate, setRate] = useState(String(initial.metadata?.rate ?? ""));
  const [included, setIncluded] = useState(initial.metadata?.included ?? false);
  const [order, setOrder] = useState(String(initial.display_order ?? "999"));

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. VAT_15"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VAT 15%"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rate (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="15"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Display order</label>
          <input
            type="number"
            min="0"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="included"
            checked={included}
            onChange={(e) => setIncluded(e.target.checked)}
            className="accent-indigo-600"
          />
          <label htmlFor="included" className="text-sm text-gray-700">
            Tax included in price (not added on top)
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !code.trim() || !name.trim()}
          onClick={() =>
            onSave({
              ...(initial.id ? { id: initial.id } : {}),
              code: code.trim(),
              name: name.trim(),
              description: desc.trim() || undefined,
              display_order: parseInt(order) || 999,
              metadata: { rate: parseFloat(rate) || 0, included },
            })
          }
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TaxesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  useAdminDocumentTitle("Taxes");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.taxes(),
    queryFn: () => adminApi.getJson<TaxesPayload>("/api/admin/taxes", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.taxes() });

  const createMut = useMutation({
    mutationFn: (d: Partial<TaxRate>) => adminApi.postJson("/api/admin/taxes", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to create"),
  });

  const updateMut = useMutation({
    mutationFn: (d: Partial<TaxRate>) => adminApi.patchJson("/api/admin/taxes", d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson("/api/admin/taxes", { id }),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Taxes" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Taxes" description="GET /api/admin/taxes" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const rates = q.data?.tax_rates ?? [];
  const stats = q.data?.statistics;
  const defaultTaxRate = q.data?.default_tax_rate;
  const providerTaxRate = q.data?.provider_tax_rate;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Taxes" description="Manage platform tax rates applied to bookings." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New tax rate
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        </div>

        {creating && (
          <div className="mb-4">
            <RateForm
              initial={{}}
              onSave={(d) => createMut.mutate(d)}
              onCancel={() => setCreating(false)}
              isSaving={createMut.isPending}
              error={mutError}
            />
          </div>
        )}
      </AdminPanel>

      {/* Platform tax defaults */}
      <AdminPanel>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Platform Tax Defaults</h2>
        <p className="text-xs text-gray-500 mb-4">
          These are the fallback tax rates used in booking calculations when a provider has not set an explicit tax rate.
          Configure the platform default in General Settings → Taxes.
        </p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-3">
            <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Platform Default Tax Rate</dt>
            <dd className="text-lg font-semibold text-gray-900">
              {defaultTaxRate != null ? `${defaultTaxRate}%` : <span className="text-gray-400 text-sm">Not set (0% applied)</span>}
            </dd>
            <p className="text-xs text-gray-400 mt-1">Applied to bookings when provider tax rate is not set.</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <dt className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Provider-Level Tax Rate Override</dt>
            <dd className="text-lg font-semibold text-gray-900">
              {providerTaxRate != null ? `${providerTaxRate}%` : <span className="text-gray-400 text-sm">Varies by provider</span>}
            </dd>
            <p className="text-xs text-gray-400 mt-1">Individual providers can override this in their profile. Set to 0% for non-VAT providers.</p>
          </div>
        </dl>
        <p className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <strong>Inclusive tax:</strong> When a tax rate is marked &ldquo;Tax included in price&rdquo;, the tax amount is
          extracted from the service price rather than added on top. Prices shown to customers are already tax-inclusive.
          Exclusive tax (default) adds the tax amount on top of the service subtotal.
        </p>
      </AdminPanel>

      {stats ? (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Statistics</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500">{k.replace(/_/g, " ")}</dt>
                <dd className="font-medium">{typeof v === "number" ? v.toFixed(2) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      ) : null}

      {mutError && !creating && !editId && (
        <p className="text-sm text-red-600 px-1">{mutError}</p>
      )}

      {rates.length === 0 ? (
        <EmptyState title="No tax rates" description="Rates will appear here when configured for this tenant." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Code</AdminTh>
              <AdminTh>Name</AdminTh>
              <AdminTh>Rate</AdminTh>
              <AdminTh>Included</AdminTh>
              <AdminTh>Order</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rates.map((r) =>
              editId === r.id ? (
                <tr key={r.id}>
                  <td colSpan={6} className="px-4 py-3">
                    <RateForm
                      initial={r}
                      onSave={(d) => updateMut.mutate(d)}
                      onCancel={() => setEditId(null)}
                      isSaving={updateMut.isPending}
                      error={mutError}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <AdminTd>{r.code}</AdminTd>
                  <AdminTd>{r.name}</AdminTd>
                  <AdminTd>{r.metadata?.rate != null ? `${r.metadata.rate}%` : "—"}</AdminTd>
                  <AdminTd>{r.metadata?.included ? "Yes" : "No"}</AdminTd>
                  <AdminTd>{r.display_order ?? "—"}</AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setEditId(r.id); setCreating(false); setMutError(null); }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Delete tax rate "${r.name}"?`)) deleteMut.mutate(r.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              )
            )}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

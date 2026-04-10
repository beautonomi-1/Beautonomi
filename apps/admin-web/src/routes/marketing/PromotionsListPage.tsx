import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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

type Promo = {
  id: string;
  name: string;
  code: string;
  type: "percentage" | "fixed_amount";
  value: number;
  start_date: string;
  end_date: string;
  usage_limit?: number | null;
  used_count?: number;
  is_active: boolean;
  min_purchase?: number | null;
  max_discount?: number | null;
  applicable_to?: string;
};

function promoFormDefaults(p?: Partial<Promo>) {
  return {
    name: p?.name ?? "",
    code: p?.code ?? "",
    type: p?.type ?? "percentage",
    value: String(p?.value ?? ""),
    start_date: p?.start_date ? p.start_date.slice(0, 10) : "",
    end_date: p?.end_date ? p.end_date.slice(0, 10) : "",
    usage_limit: p?.usage_limit != null ? String(p.usage_limit) : "",
    min_purchase: p?.min_purchase != null ? String(p.min_purchase) : "",
    max_discount: p?.max_discount != null ? String(p.max_discount) : "",
    is_active: p?.is_active ?? true,
  };
}

function PromoForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<Promo>;
  onSave: (d: Partial<Promo>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const def = promoFormDefaults(initial);
  const [name, setName] = useState(def.name);
  const [code, setCode] = useState(def.code);
  const [type, setType] = useState<"percentage" | "fixed_amount">(def.type as "percentage" | "fixed_amount");
  const [value, setValue] = useState(def.value);
  const [startDate, setStartDate] = useState(def.start_date);
  const [endDate, setEndDate] = useState(def.end_date);
  const [usageLimit, setUsageLimit] = useState(def.usage_limit);
  const [minPurchase, setMinPurchase] = useState(def.min_purchase);
  const [maxDiscount, setMaxDiscount] = useState(def.max_discount);
  const [isActive, setIsActive] = useState(def.is_active);

  const isValid = name.trim() && code.trim() && value && startDate && endDate;

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Sale" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER20" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
          <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value as "percentage" | "fixed_amount")}>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed_amount">Fixed amount</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Value * {type === "percentage" ? "(%)" : "(amount)"}
          </label>
          <input type="number" min="0" step="0.01" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
          <input type="date" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">End Date *</label>
          <input type="date" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Usage limit</label>
          <input type="number" min="0" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Min purchase</label>
          <input type="number" min="0" step="0.01" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max discount</label>
          <input type="number" min="0" step="0.01" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="No limit" />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input type="checkbox" id="active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-indigo-600" />
          <label htmlFor="active" className="text-sm text-gray-700">Active</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !isValid}
          onClick={() => onSave({
            ...(initial.id ? { id: initial.id } : {}),
            name: name.trim(),
            code: code.trim().toUpperCase(),
            type,
            value: parseFloat(value) || 0,
            start_date: startDate,
            end_date: endDate,
            usage_limit: usageLimit ? parseInt(usageLimit) : null,
            min_purchase: minPurchase ? parseFloat(minPurchase) : null,
            max_discount: maxDiscount ? parseFloat(maxDiscount) : null,
            is_active: isActive,
          })}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function PromotionsListPage() {
  useAdminDocumentTitle("Promotions");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.promotions(),
    queryFn: () => adminApi.getJson<Promo[]>("/api/admin/promotions", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.promotions() });

  const createMut = useMutation({
    mutationFn: (d: Partial<Promo>) => adminApi.postJson("/api/admin/promotions", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Promo> & { id: string }) =>
      adminApi.patchJson(`/api/admin/promotions/${id}`, d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/promotions/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Promotions" />
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

  const editRow = editId ? rows.find((r) => r.id === editId) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Promotions" description="Manage discount codes and promotional campaigns." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New promotion
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
            <PromoForm
              initial={{}}
              onSave={(d) => createMut.mutate(d)}
              onCancel={() => setCreating(false)}
              isSaving={createMut.isPending}
              error={mutError}
            />
          </div>
        )}
        {editId && editRow && (
          <div className="mb-4">
            <PromoForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<Promo> & { id: string })}
              onCancel={() => setEditId(null)}
              isSaving={updateMut.isPending}
              error={mutError}
            />
          </div>
        )}
      </AdminPanel>

      {mutError && !creating && !editId && (
        <p className="text-sm text-red-600 px-1">{mutError}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No promotions" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Code</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Value</AdminTh>
              <AdminTh>Validity</AdminTh>
              <AdminTh>Used / Limit</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium">{r.name}</AdminTd>
                <AdminTd className="font-mono text-xs">{r.code}</AdminTd>
                <AdminTd>{r.type === "percentage" ? "%" : "Fixed"}</AdminTd>
                <AdminTd>{r.type === "percentage" ? `${r.value}%` : `${r.value}`}</AdminTd>
                <AdminTd className="text-xs">
                  {r.start_date?.slice(0, 10)} → {r.end_date?.slice(0, 10)}
                </AdminTd>
                <AdminTd>{r.used_count ?? 0} / {r.usage_limit ?? "∞"}</AdminTd>
                <AdminTd>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${r.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </AdminTd>
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
                      onClick={() => { if (confirm(`Delete "${r.name}"?`)) deleteMut.mutate(r.id); }}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminToast } from "@/lib/adminToast";
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
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useTenantFeatureFlags, TENANT_PAYMENT_FEATURE_KEYS } from "@/hooks/useTenantFeatureFlags";

type Gc = Record<string, unknown> & { id?: string; code?: string; balance?: number; is_active?: boolean };

type GiftPayload = {
  gift_cards: Gc[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
};

export function GiftCardsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );
  const qc = useQueryClient();
  const flagsQ = useTenantFeatureFlags([TENANT_PAYMENT_FEATURE_KEYS.GIFT_CARDS], allowed);
  const showGiftDisabledBanner =
    flagsQ.isSuccess && flagsQ.data?.features?.[TENANT_PAYMENT_FEATURE_KEYS.GIFT_CARDS] === false;

  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const search = sp.get("search") || "";
  const qk = useMemo(() => `${page}|${status}|${search}`, [page, status, search]);
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const [showCreate, setShowCreate] = useState(false);
  const [cCode, setCCode] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [cCurrency, setCCurrency] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.giftCards(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "30");
      if (status) p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      return adminApi.getJson<GiftPayload>(`/api/admin/gift-cards?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/gift-cards/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "gift-cards"] });
      adminToast.success("Gift card deleted");
    },
    onError: (e: Error) => adminToast.error(`Failed to delete gift card: ${e.message}`),
  });

  const create = useMutation({
    mutationFn: () =>
      adminApi.postJson<unknown>("/api/admin/gift-cards", {
        code: cCode.trim().toUpperCase(),
        initial_balance: parseFloat(cAmount),
        ...(cCurrency.trim() ? { currency: cCurrency.trim().toUpperCase() } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "gift-cards"] });
      setShowCreate(false);
      setCCode("");
      setCAmount("");
      setCCurrency("");
      adminToast.success("Gift card created");
    },
    onError: (e: Error) => adminToast.error(`Failed to create gift card: ${e.message}`),
  });

  const rows = q.data?.gift_cards ?? [];
  const meta = q.data?.meta;

  function patch(u: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Gift cards" />
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

  const createErr = create.error instanceof Error ? create.error.message : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Gift cards" description="List, create, and open a card for balance updates." />
      {showGiftDisabledBanner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <code className="rounded bg-amber-100 px-1">gift_cards</code> is disabled for this market — customer
          purchase UI is off. Admin listing and manual cards still work for support.
        </div>
      ) : null}
      <AdminPanel>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-600">
            Status{" "}
            <select
              className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
              value={status}
              onChange={(e) => patch({ status: e.target.value || null, page: "1" })}
            >
              <option value="">All</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="expired">expired</option>
              <option value="zero_balance">zero_balance</option>
            </select>
          </label>
          <label className="text-sm text-gray-600">
            Search code / email{" "}
            <input
              className="ml-2 w-48 rounded border border-gray-300 px-2 py-1 text-sm"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() => patch({ search: searchDraft.trim() || null, page: "1" })}
              onKeyDown={(e) => {
                if (e.key === "Enter") patch({ search: searchDraft.trim() || null, page: "1" });
              }}
            />
          </label>
          <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setShowCreate((s) => !s)}>
            {showCreate ? "Hide create" : "Create card"}
          </button>
        </div>
      </AdminPanel>

      {showCreate ? (
        <AdminPanel>
          <p className="mb-2 text-sm text-gray-600">POST /api/admin/gift-cards</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              Code
              <input className="ml-2 rounded border border-gray-300 px-2 py-1 font-mono text-xs uppercase" value={cCode} onChange={(e) => setCCode(e.target.value)} />
            </label>
            <label className="text-sm">
              Initial balance
              <input className="ml-2 w-28 rounded border border-gray-300 px-2 py-1" value={cAmount} onChange={(e) => setCAmount(e.target.value)} inputMode="decimal" />
            </label>
            <label className="text-sm">
              Currency (optional)
              <input className="ml-2 w-20 rounded border border-gray-300 px-2 py-1 uppercase" value={cCurrency} onChange={(e) => setCCurrency(e.target.value)} />
            </label>
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={create.isPending || !cCode.trim() || !cAmount.trim() || Number.isNaN(parseFloat(cAmount))}
              onClick={() => create.mutate()}
            >
              Create
            </button>
          </div>
          {createErr ? <p className="mt-2 text-sm text-red-600">{createErr}</p> : null}
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No gift cards" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Code</AdminTh>
              <AdminTh>Balance</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-mono text-xs">{String(r.code ?? "")}</AdminTd>
                <AdminTd className="tabular-nums">{String(r.balance ?? "")}</AdminTd>
                <AdminTd>{r.is_active ? "yes" : "no"}</AdminTd>
                <AdminTd>
                  <div className="flex gap-2">
                    {r.id ? (
                      <Link to={adminSpaTo(`/admin/gift-cards/${r.id}`)} className="text-xs text-gray-900 underline">
                        Open
                      </Link>
                    ) : null}
                    {r.id ? (
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => { if (confirm(`Delete gift card "${String(r.code ?? r.id)}"?`)) deleteMut.mutate(String(r.id)); }}
                        className="text-xs text-red-600 underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {meta?.has_more ? (
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          onClick={() => patch({ page: String(page + 1) })}
        >
          Next page
        </button>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
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
import { useTenantFeatureFlags, TENANT_PAYMENT_FEATURE_KEYS } from "@/hooks/useTenantFeatureFlags";

type PlanRow = Record<string, unknown> & {
  name?: string;
  id?: string;
  pricing_plan?: unknown;
  price_monthly?: number | null;
  price_yearly?: number | null;
  currency?: string;
  is_free?: boolean;
  is_active?: boolean;
  is_popular?: boolean;
  display_order?: number;
  description?: string | null;
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
  max_locations?: number;
};

export function PlansListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const qc = useQueryClient();
  const paystackQ = useTenantFeatureFlags([TENANT_PAYMENT_FEATURE_KEYS.PAYMENT_PAYSTACK], allowed);
  const showPaystackOffBanner =
    paystackQ.isSuccess &&
    paystackQ.data?.features?.[TENANT_PAYMENT_FEATURE_KEYS.PAYMENT_PAYSTACK] === false;

  const q = useQuery({
    queryKey: adminQueryKeys.plans(),
    queryFn: () => adminApi.getJson<PlanRow[]>("/api/admin/plans", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  const [showCreate, setShowCreate] = useState(false);
  const [nName, setNName] = useState("");
  const [nDesc, setNDesc] = useState("");
  const [nMonthly, setNMonthly] = useState("");
  const [nYearly, setNYearly] = useState("");
  const [nCurrency, setNCurrency] = useState("");
  const [nFree, setNFree] = useState(false);
  const [nActive, setNActive] = useState(true);
  const [nPopular, setNPopular] = useState(false);
  const [nOrder, setNOrder] = useState("0");
  const [nMaxLoc, setNMaxLoc] = useState("1");

  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eMonthly, setEMonthly] = useState("");
  const [eYearly, setEYearly] = useState("");
  const [eCurrency, setECurrency] = useState("");
  const [eFree, setEFree] = useState(false);
  const [eActive, setEActive] = useState(true);
  const [ePopular, setEPopular] = useState(false);
  const [eOrder, setEOrder] = useState("0");
  const [eMaxLoc, setEMaxLoc] = useState("1");
  const [eUpdateSubs, setEUpdateSubs] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.plans() });

  const createPlan = useMutation({
    mutationFn: () =>
      adminApi.postJson<unknown>("/api/admin/subscription-plans", {
        name: nName.trim(),
        description: nDesc.trim() || undefined,
        price_monthly: nFree ? undefined : nMonthly.trim() ? parseFloat(nMonthly) : undefined,
        price_yearly: nFree ? undefined : nYearly.trim() ? parseFloat(nYearly) : undefined,
        ...(nCurrency.trim() ? { currency: nCurrency.trim().toUpperCase() } : {}),
        is_free: nFree,
        is_active: nActive,
        is_popular: nPopular,
        display_order: parseInt(nOrder, 10) || 0,
        max_locations: parseInt(nMaxLoc, 10) || 1,
      }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setNName("");
      setNDesc("");
      setNMonthly("");
      setNYearly("");
      setNCurrency("");
      setNFree(false);
      setNActive(true);
      setNPopular(false);
      setNOrder("0");
      setNMaxLoc("1");
    },
  });

  const savePlan = useMutation({
    mutationFn: () =>
      adminApi.putJson<unknown>("/api/admin/subscription-plans", {
        id: editId,
        name: eName.trim(),
        description: eDesc.trim() || undefined,
        price_monthly: eFree ? undefined : eMonthly.trim() ? parseFloat(eMonthly) : undefined,
        price_yearly: eFree ? undefined : eYearly.trim() ? parseFloat(eYearly) : undefined,
        ...(eCurrency.trim() ? { currency: eCurrency.trim().toUpperCase() } : {}),
        is_free: eFree,
        is_active: eActive,
        is_popular: ePopular,
        display_order: parseInt(eOrder, 10) || 0,
        max_locations: parseInt(eMaxLoc, 10) || 1,
        ...(eUpdateSubs ? { update_existing_subscriptions: true } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setEditId(null);
      setEUpdateSubs(false);
    },
  });

  function openEdit(row: PlanRow) {
    if (!row.id) return;
    setEditId(row.id);
    setEName(String(row.name ?? ""));
    setEDesc(String(row.description ?? ""));
    setEMonthly(row.price_monthly != null ? String(row.price_monthly) : "");
    setEYearly(row.price_yearly != null ? String(row.price_yearly) : "");
    setECurrency(String(row.currency ?? ""));
    setEFree(Boolean(row.is_free));
    setEActive(row.is_active !== false);
    setEPopular(Boolean(row.is_popular));
    setEOrder(String(row.display_order ?? 0));
    setEMaxLoc(String(row.max_locations ?? 1));
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Plans" />
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

  const createErr = createPlan.error instanceof Error ? createPlan.error.message : null;
  const saveErr = savePlan.error instanceof Error ? savePlan.error.message : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Plans & subscription products"
        description="GET /api/admin/plans (list). Create/update via /api/admin/subscription-plans (Paystack sync when prices apply and Paystack is on)."
      />
      {showPaystackOffBanner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <code className="rounded bg-amber-100 px-1">payment_paystack</code> is off for this market — paid plan
          creation may still write DB rows, but gateway plan sync can fail. Enable the flag for full billing integration.
        </div>
      ) : null}
      <AdminPanel>
        <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Hide create form" : "New subscription plan"}
        </button>
      </AdminPanel>

      {showCreate ? (
        <AdminPanel>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Name *
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nName} onChange={(e) => setNName(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nDesc} onChange={(e) => setNDesc(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={nFree} onChange={(e) => setNFree(e.target.checked)} />
              Free plan (no Paystack product)
            </label>
            {!nFree ? (
              <>
                <label className="text-sm">
                  Price monthly
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nMonthly} onChange={(e) => setNMonthly(e.target.value)} />
                </label>
                <label className="text-sm">
                  Price yearly
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nYearly} onChange={(e) => setNYearly(e.target.value)} />
                </label>
                <label className="text-sm">
                  Currency (optional)
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase" value={nCurrency} onChange={(e) => setNCurrency(e.target.value)} />
                </label>
              </>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nActive} onChange={(e) => setNActive(e.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nPopular} onChange={(e) => setNPopular(e.target.checked)} />
              Popular
            </label>
            <label className="text-sm">
              Display order
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nOrder} onChange={(e) => setNOrder(e.target.value)} />
            </label>
            <label className="text-sm">
              Max locations
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={nMaxLoc} onChange={(e) => setNMaxLoc(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={createPlan.isPending || !nName.trim()}
            onClick={() => createPlan.mutate()}
          >
            Create plan
          </button>
          {createErr ? <p className="mt-2 text-sm text-red-600">{createErr}</p> : null}
        </AdminPanel>
      ) : null}

      {editId ? (
        <AdminPanel>
          <p className="mb-2 text-sm font-medium text-gray-900">Edit plan</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Name
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eName} onChange={(e) => setEName(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={eFree} onChange={(e) => setEFree(e.target.checked)} />
              Free plan
            </label>
            {!eFree ? (
              <>
                <label className="text-sm">
                  Price monthly
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eMonthly} onChange={(e) => setEMonthly(e.target.value)} />
                </label>
                <label className="text-sm">
                  Price yearly
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eYearly} onChange={(e) => setEYearly(e.target.value)} />
                </label>
                <label className="text-sm">
                  Currency (optional)
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase" value={eCurrency} onChange={(e) => setECurrency(e.target.value)} />
                </label>
              </>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ePopular} onChange={(e) => setEPopular(e.target.checked)} />
              Popular
            </label>
            <label className="text-sm">
              Display order
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eOrder} onChange={(e) => setEOrder(e.target.value)} />
            </label>
            <label className="text-sm">
              Max locations
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={eMaxLoc} onChange={(e) => setEMaxLoc(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={eUpdateSubs} onChange={(e) => setEUpdateSubs(e.target.checked)} />
              When saving price changes, propagate to existing Paystack subscriptions (update_existing_subscriptions)
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={savePlan.isPending || !eName.trim()}
              onClick={() => savePlan.mutate()}
            >
              Save plan
            </button>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setEditId(null)}>
              Cancel
            </button>
          </div>
          {saveErr ? <p className="mt-2 text-sm text-red-600">{saveErr}</p> : null}
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No plans" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Monthly</AdminTh>
              <AdminTh>Yearly</AdminTh>
              <AdminTh>Free</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Pricing linked</AdminTh>
              <AdminTh>Paystack</AdminTh>
              <AdminTh> </AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-medium">{String(r.name ?? "")}</AdminTd>
                <AdminTd className="tabular-nums">{r.price_monthly != null ? String(r.price_monthly) : "—"}</AdminTd>
                <AdminTd className="tabular-nums">{r.price_yearly != null ? String(r.price_yearly) : "—"}</AdminTd>
                <AdminTd>{r.is_free ? "yes" : "no"}</AdminTd>
                <AdminTd>{r.is_active !== false ? "yes" : "no"}</AdminTd>
                <AdminTd>{r.pricing_plan ? "yes" : "no"}</AdminTd>
                <AdminTd className="max-w-[8rem] truncate text-xs font-mono">
                  {r.paystack_plan_code_monthly || r.paystack_plan_code_yearly ? "codes set" : "—"}
                </AdminTd>
                <AdminTd>
                  <button type="button" className="text-sm text-gray-900 underline" onClick={() => openEdit(r)}>
                    Edit
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

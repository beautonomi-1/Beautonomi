import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
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
import { adminToast } from "@/lib/adminToast";
import { useTenantFeatureFlags, TENANT_PAYMENT_FEATURE_KEYS } from "@/hooks/useTenantFeatureFlags";
import { publicSiteOrigin } from "@/config/publicEnv";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { isBlankHtmlContent } from "@/lib/pricingFeatureHtml";
import { getFreePlanFeatures, normalizeFeatures, type PlanFeaturesMap } from "@beautonomi/subscription-features";
import { PlanFeatureEditor } from "./PlanFeatureEditor";

type PricingPlanLink = {
  id?: string;
  price?: string;
  period?: string | null;
  description?: string | null;
  cta_text?: string;
  display_order?: number;
  is_active?: boolean;
  /** Shown on /pricing and provider catalog cards (e.g. ZAR) */
  currency?: string | null;
};

type PricingOnlyApiRow = {
  row_kind?: string;
  reason?: string;
  orphan_subscription_plan_id?: string | null;
  pricing_plan_id?: string;
  pricing_plan?: Record<string, unknown> & { id?: string; name?: string; subscription_plan_id?: string | null };
};

type PlanRow = Record<string, unknown> & {
  name?: string;
  id?: string;
  pricing_plan?: PricingPlanLink | null;
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
  max_bookings_per_month?: number | null;
  max_staff_members?: number | null;
  features?: Record<string, unknown> | unknown[] | null;
};

type PlansPayload =
  | PlanRow[]
  | {
      plans?: PlanRow[];
      pricing_only?: Array<Record<string, unknown> & { pricing_plan_id?: string; reason?: string }>;
      meta?: {
        tenant_id?: string | null;
        subscription_plan_count?: number;
        pricing_plan_count?: number;
        active_pricing_plan_count?: number;
        pricing_only_active_count?: number;
        source?: string;
        read_client?: string;
        empty_reason?: string | null;
      };
    };

function featuresFromRow(row: PlanRow): PlanFeaturesMap {
  const f = row.features;
  if (f && typeof f === "object" && !Array.isArray(f)) {
    return normalizeFeatures(f as Record<string, unknown>);
  }
  return getFreePlanFeatures();
}

export function PlansListPage() {
  const { allowed, denied } = useSuperadminPage(
    "Plans & pricing management is restricted to platform superadmins (matches Next.js /admin/plans).",
  );
  const qc = useQueryClient();
  const paystackQ = useTenantFeatureFlags([TENANT_PAYMENT_FEATURE_KEYS.PAYMENT_PAYSTACK], allowed);
  const showPaystackOffBanner =
    paystackQ.isSuccess &&
    paystackQ.data?.features?.[TENANT_PAYMENT_FEATURE_KEYS.PAYMENT_PAYSTACK] === false;

  const q = useQuery({
    queryKey: adminQueryKeys.plans(),
    queryFn: () => adminApi.getJson<PlansPayload>("/api/admin/plans", { timeoutMs: 60_000 }),
    enabled: allowed,
    staleTime: 0,
  });

  const rows = Array.isArray(q.data) ? q.data : q.data?.plans ?? [];
  const plansMeta = Array.isArray(q.data) ? null : q.data?.meta ?? null;
  const pricingOnlyRows: PricingOnlyApiRow[] = Array.isArray(q.data) ? [] : (q.data?.pricing_only ?? []);

  const webOrigin = publicSiteOrigin();
  const webPlansEditorUrl = webOrigin ? `${webOrigin}/admin/plans` : "";

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
  const [nMaxBookings, setNMaxBookings] = useState("");
  const [nMaxStaff, setNMaxStaff] = useState("");
  const [nFeatures, setNFeatures] = useState<PlanFeaturesMap>(() => getFreePlanFeatures());

  const [editId, setEditId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<PlanRow | null>(null);
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
  const [eMaxBookings, setEMaxBookings] = useState("");
  const [eMaxStaff, setEMaxStaff] = useState("");
  const [eUpdateSubs, setEUpdateSubs] = useState(false);
  const [ePaystackMonthly, setEPaystackMonthly] = useState("");
  const [ePaystackYearly, setEPaystackYearly] = useState("");
  /** Entitlements / gating — stored on subscription_plans.features */
  const [eFeatures, setEFeatures] = useState<PlanFeaturesMap>(() => getFreePlanFeatures());
  /** Public /pricing marketing card (pricing_plans + pricing_plan_features) */
  const [eShowPricing, setEShowPricing] = useState(false);
  const [ePriceDisplay, setEPriceDisplay] = useState("");
  const [ePeriodDisplay, setEPeriodDisplay] = useState("month");
  const [eDescDisplay, setEDescDisplay] = useState("");
  const [eCtaText, setECtaText] = useState("Get started");
  const [eOrderPricing, setEOrderPricing] = useState("0");
  const [ePricingCurrency, setEPricingCurrency] = useState("");
  /** One rich-text row per `pricing_plan_features` line (HTML from WYSIWYG). */
  const [eMarketingFeatures, setEMarketingFeatures] = useState<string[]>([]);

  /** Orphan / pricing-only marketing card (no or broken subscription link) */
  const [poEdit, setPoEdit] = useState<PricingOnlyApiRow | null>(null);
  const [poName, setPoName] = useState("");
  const [poSubPlanId, setPoSubPlanId] = useState("");
  const [poPrice, setPoPrice] = useState("");
  const [poPeriod, setPoPeriod] = useState("");
  const [poDesc, setPoDesc] = useState("");
  const [poCta, setPoCta] = useState("Get started");
  const [poOrder, setPoOrder] = useState("0");
  const [poPopular, setPoPopular] = useState(false);
  const [poActive, setPoActive] = useState(true);
  const [poCurrency, setPoCurrency] = useState("");
  const [poFeatures, setPoFeatures] = useState<string[]>([]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.plans() });

  const deletePlan = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/subscription-plans/${id}`),
    onSuccess: (res) => {
      invalidate();
      const r = res as { action?: string; message?: string };
      adminToast.success(r.message ?? "Plan deleted");
    },
    onError: (err: Error) => adminToast.error(`Delete failed: ${err.message}`),
  });

  const createPlan = useMutation({
    mutationFn: () => {
      const featuresObj = normalizeFeatures(nFeatures);
      return adminApi.postJson<unknown>("/api/admin/subscription-plans", {
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
        max_bookings_per_month: nMaxBookings.trim() ? parseInt(nMaxBookings, 10) : null,
        max_staff_members: nMaxStaff.trim() ? parseInt(nMaxStaff, 10) : null,
        features: featuresObj,
      });
    },
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
      setNMaxBookings("");
      setNMaxStaff("");
      setNFeatures(getFreePlanFeatures());
    },
  });

  const savePoCard = useMutation({
    mutationFn: async () => {
      const id = String(poEdit?.pricing_plan_id ?? "");
      if (!id || !poEdit) throw new Error("No pricing card selected");
      if (!poSubPlanId.trim()) {
        throw new Error("Select a subscription plan to link. Paid rows only appear in the provider upgrade flow when a linked, active card exists.");
      }
      await adminApi.putJson<unknown>("/api/admin/pricing-plans", {
        id,
        name: poName.trim() || "Plan",
        price: poPrice.trim() || "0",
        period: poPeriod.trim() || null,
        description: poDesc.trim() || null,
        cta_text: poCta.trim() || "Get started",
        is_popular: poPopular,
        display_order: parseInt(poOrder, 10) || 0,
        is_active: poActive,
        subscription_plan_id: poSubPlanId.trim(),
        currency: poCurrency.trim() ? poCurrency.trim().toUpperCase() : null,
      });
      const lines = poFeatures.filter((t) => !isBlankHtmlContent(t));
      await adminApi.putJson(`/api/admin/pricing-plans/${id}/features`, { features: lines });
    },
    onSuccess: () => {
      invalidate();
      setPoEdit(null);
    },
    onError: (err: Error) => adminToast.error(err.message),
  });

  const hidePoCard = useMutation({
    mutationFn: (pricingId: string) => adminApi.putJson("/api/admin/pricing-plans", { id: pricingId, is_active: false }),
    onSuccess: () => {
      invalidate();
      adminToast.success("Pricing card hidden from /pricing. Link again from a subscription plan when ready.");
    },
    onError: (err: Error) => adminToast.error(err.message),
  });

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("No plan selected");

      const featuresObj = normalizeFeatures(eFeatures);

      const savedPlan = await adminApi.putJson<PlanRow>("/api/admin/subscription-plans", {
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
        max_bookings_per_month: eMaxBookings.trim() ? parseInt(eMaxBookings, 10) : null,
        max_staff_members: eMaxStaff.trim() ? parseInt(eMaxStaff, 10) : null,
        features: featuresObj,
        ...(ePaystackMonthly.trim() ? { paystack_plan_code_monthly: ePaystackMonthly.trim() } : {}),
        ...(ePaystackYearly.trim() ? { paystack_plan_code_yearly: ePaystackYearly.trim() } : {}),
        ...(eUpdateSubs ? { update_existing_subscriptions: true } : {}),
      });

      const subId = String(savedPlan.id ?? editId);
      const prevPp = editRow?.pricing_plan;
      const prevPpFull = (prevPp ?? {}) as Record<string, unknown>;

      if (eShowPricing) {
        const pricingPayload = {
          ...(prevPp?.id ? { id: prevPp.id } : {}),
          name: eName.trim(),
          price: ePriceDisplay.trim() || (eMonthly.trim() ? `R${eMonthly.trim()}` : "0"),
          period: ePeriodDisplay.trim() || null,
          description: eDescDisplay.trim() || null,
          cta_text: eCtaText.trim() || "Get started",
          is_popular: ePopular,
          display_order: parseInt(eOrderPricing, 10) || 0,
          is_active: eActive,
          subscription_plan_id: subId,
          currency: ePricingCurrency.trim() ? ePricingCurrency.trim().toUpperCase() : null,
          paystack_plan_code_monthly:
            (savedPlan.paystack_plan_code_monthly as string | null | undefined) ??
            (prevPpFull.paystack_plan_code_monthly as string | null | undefined) ??
            null,
          paystack_plan_code_yearly:
            (savedPlan.paystack_plan_code_yearly as string | null | undefined) ??
            (prevPpFull.paystack_plan_code_yearly as string | null | undefined) ??
            null,
        };
        const ppResult = await (prevPp?.id
          ? adminApi.putJson<PlanRow & { id: string }>("/api/admin/pricing-plans", pricingPayload)
          : adminApi.postJson<PlanRow & { id: string }>("/api/admin/pricing-plans", pricingPayload));
        const ppId = ppResult && typeof ppResult === "object" && "id" in ppResult ? String(ppResult.id) : prevPp?.id;
        if (ppId) {
          const lines = eMarketingFeatures.filter((t) => !isBlankHtmlContent(t));
          await adminApi.putJson(`/api/admin/pricing-plans/${ppId}/features`, { features: lines });
        }
      } else if (prevPp?.id) {
        await adminApi.putJson("/api/admin/pricing-plans", {
          id: prevPp.id,
          is_active: false,
          subscription_plan_id: null,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      setEditId(null);
      setEditRow(null);
      setEUpdateSubs(false);
    },
  });

  function closeEdit() {
    setEditId(null);
    setEditRow(null);
  }

  function closePoEdit() {
    setPoEdit(null);
  }

  function openPoEdit(row: PricingOnlyApiRow) {
    setPoEdit(row);
    const pp = (row.pricing_plan ?? {}) as Record<string, unknown>;
    setPoName(String(pp.name ?? ""));
    const fromRow =
      pp.subscription_plan_id != null && String(pp.subscription_plan_id).trim()
        ? String(pp.subscription_plan_id)
        : row.orphan_subscription_plan_id != null && String(row.orphan_subscription_plan_id).trim()
          ? String(row.orphan_subscription_plan_id)
          : "";
    setPoSubPlanId(fromRow);
    setPoPrice(String(pp.price ?? ""));
    setPoPeriod(pp.period != null && String(pp.period) !== "" ? String(pp.period) : "");
    setPoDesc(pp.description != null ? String(pp.description) : "");
    setPoCta(String(pp.cta_text ?? "Get started"));
    setPoOrder(String(pp.display_order ?? 0));
    setPoPopular(Boolean(pp.is_popular));
    setPoActive(pp.is_active !== false);
    setPoCurrency(pp.currency != null ? String(pp.currency) : "");
    setPoFeatures([]);
  }

  function openEdit(row: PlanRow) {
    if (!row.id) return;
    setEditId(row.id);
    setEditRow(row);
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
    setEMaxBookings(row.max_bookings_per_month != null ? String(row.max_bookings_per_month) : "");
    setEMaxStaff(row.max_staff_members != null ? String(row.max_staff_members) : "");
    setEPaystackMonthly(String(row.paystack_plan_code_monthly ?? ""));
    setEPaystackYearly(String(row.paystack_plan_code_yearly ?? ""));
    setEFeatures(featuresFromRow(row));
    const pp = row.pricing_plan;
    setEShowPricing(!!pp?.id);
    setEPriceDisplay(String(pp?.price ?? ""));
    setEPeriodDisplay(pp?.period != null && pp.period !== "" ? String(pp.period) : "month");
    setEDescDisplay(pp?.description != null ? String(pp.description) : "");
    setECtaText(String(pp?.cta_text ?? "Get started"));
    setEOrderPricing(String(pp?.display_order ?? row.display_order ?? 0));
    setEPricingCurrency(pp && "currency" in pp && pp.currency != null ? String(pp.currency) : "");
    setEMarketingFeatures([]);
  }

  useEffect(() => {
    if (!editRow?.pricing_plan?.id) {
      return;
    }
    const id = String(editRow.pricing_plan.id);
    let cancelled = false;
    adminApi
      .getJson<Array<{ feature_text?: string }>>(`/api/admin/pricing-plans/${id}/features`, { timeoutMs: 30_000 })
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setEMarketingFeatures(
          rows
            .map((r) => r.feature_text)
            .filter((t): t is string => typeof t === "string" && t.length > 0),
        );
      })
      .catch(() => {
        if (!cancelled) setEMarketingFeatures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [editRow?.id, editRow?.pricing_plan?.id]);

  useEffect(() => {
    if (!poEdit?.pricing_plan_id) return;
    const id = String(poEdit.pricing_plan_id);
    let cancelled = false;
    adminApi
      .getJson<Array<{ feature_text?: string }>>(`/api/admin/pricing-plans/${id}/features`, { timeoutMs: 30_000 })
      .then((r) => {
        if (cancelled || !Array.isArray(r)) return;
        setPoFeatures(
          r
            .map((x) => x.feature_text)
            .filter((t): t is string => typeof t === "string" && t.length > 0),
        );
      })
      .catch(() => {
        if (!cancelled) setPoFeatures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [poEdit?.pricing_plan_id]);

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

  function providerCatalogLabel(r: PlanRow): "yes" | "no" {
    if (r.is_free) return "yes";
    const pp = r.pricing_plan;
    if (!pp?.id) return "no";
    if (pp.is_active === false) return "no";
    return "yes";
  }

  return (
    <div className="space-y-6">
        <AdminPageHeader
        title="Plans & subscription products"
        description="Entitlements and limits live in subscription_plans (including the feature JSON). Provider upgrade UI and the public /pricing page show copy from linked, active pricing_plans plus marketing bullets in pricing_plan_features. Paid plans only appear in the in-app catalog when a linked marketing card is active."
      />
      {webPlansEditorUrl ? (
        <AdminPanel className="border-indigo-200 bg-indigo-50/80">
          <p className="text-sm text-gray-800">
            <span className="font-semibold">Full visual editor (Next.js admin):</span> advanced toggles and the same
            merged flow as production live at{" "}
            <a className="font-mono text-indigo-800 underline" href={webPlansEditorUrl} target="_blank" rel="noreferrer">
              /admin/plans
            </a>
            . Use this SPA for quick edits; use that page for the full dialog UI.
          </p>
        </AdminPanel>
      ) : (
        <AdminPanel className="border-amber-200 bg-amber-50/80">
          <p className="text-sm text-amber-950">
            Set <code className="rounded bg-amber-100 px-1">VITE_SITE_URL</code> (or{" "}
            <code className="rounded bg-amber-100 px-1">VITE_APP_URL</code>) so we can link to the full{" "}
            <code className="rounded bg-amber-100 px-1">/admin/plans</code> editor on the web app.
          </p>
        </AdminPanel>
      )}
      {showPaystackOffBanner ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <code className="rounded bg-amber-100 px-1">payment_paystack</code> is off for this market — paid plan
          creation may still write DB rows, but gateway plan sync can fail. Enable the flag for full billing integration.
        </div>
      ) : null}
      <AdminPanel>
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          onClick={() => setShowCreate((s) => !s)}
        >
          {showCreate ? "Hide create form" : "New subscription plan"}
        </button>
      </AdminPanel>

      {showCreate ? (
        <AdminPanel>
          <p className="mb-2 text-sm text-gray-600">
            Creates a <strong>subscription_plans</strong> row (billing + entitlements). To show a card on{" "}
            <strong>/pricing</strong>, create the plan here, then edit it and enable “Show on pricing page”.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Name *
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={nName}
                onChange={(e) => setNName(e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={nDesc}
                onChange={(e) => setNDesc(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={nFree} onChange={(e) => setNFree(e.target.checked)} />
              Free plan (no Paystack product)
            </label>
            {!nFree ? (
              <>
                <label className="text-sm">
                  Price monthly
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                    value={nMonthly}
                    onChange={(e) => setNMonthly(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Price yearly
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                    value={nYearly}
                    onChange={(e) => setNYearly(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Currency (optional)
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase"
                    value={nCurrency}
                    onChange={(e) => setNCurrency(e.target.value)}
                  />
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
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={nOrder}
                onChange={(e) => setNOrder(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Max locations
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={nMaxLoc}
                onChange={(e) => setNMaxLoc(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Max bookings / month (optional)
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={nMaxBookings}
                onChange={(e) => setNMaxBookings(e.target.value)}
                placeholder="e.g. 50"
              />
            </label>
            <label className="text-sm">
              Max staff (optional)
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={nMaxStaff}
                onChange={(e) => setNMaxStaff(e.target.value)}
              />
            </label>
            <div className="sm:col-span-2">
              <PlanFeatureEditor value={nFeatures} onChange={setNFeatures} />
            </div>
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
          <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <p>
              <strong>Billing & limits</strong> below are stored on <code className="rounded bg-white px-1">subscription_plans</code>{" "}
              and drive the provider app and enforcement.
            </p>
            <p>
              <strong>Entitlements (feature permissions)</strong> are the <code className="rounded bg-white px-1">features</code>{" "}
              JSON on <code className="rounded bg-white px-1">subscription_plans</code> (gating, limits, integrations). Include{" "}
              <code className="rounded bg-white px-1">paystack_virtual_terminal</code> with{" "}
              <code className="rounded bg-white px-1">enabled: true</code>,{" "}
              <code className="rounded bg-white px-1">max_terminals: null</code> (unlimited), and capability flags alongside{" "}
              <code className="rounded bg-white px-1">yoco_integration</code>. This is
              not the same as the bullet list below — that list is marketing copy.
            </p>
            <p>
              <strong>Provider-facing bullets</strong> and <strong>public /pricing</strong> both use the same marketing
              data: an <strong>active</strong> <code className="rounded bg-white px-1">pricing_plans</code> row linked to
              this subscription product, with HTML bullets in <code className="rounded bg-white px-1">pricing_plan_features</code>
              . Enable “Show on pricing page” to create or refresh that link. For paid plans, the provider catalog also requires
              this link.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Name
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={eName}
                onChange={(e) => setEName(e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Description (internal / admin)
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={eDesc}
                onChange={(e) => setEDesc(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={eFree} onChange={(e) => setEFree(e.target.checked)} />
              Free plan
            </label>
            {!eFree ? (
              <>
                <label className="text-sm">
                  Price monthly
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                    value={eMonthly}
                    onChange={(e) => setEMonthly(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Price yearly
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                    value={eYearly}
                    onChange={(e) => setEYearly(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Currency (optional)
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase"
                    value={eCurrency}
                    onChange={(e) => setECurrency(e.target.value)}
                  />
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
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={eOrder}
                onChange={(e) => setEOrder(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Max locations
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={eMaxLoc}
                onChange={(e) => setEMaxLoc(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Max bookings / month
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={eMaxBookings}
                onChange={(e) => setEMaxBookings(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Max staff
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={eMaxStaff}
                onChange={(e) => setEMaxStaff(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Paystack plan code (monthly)
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                value={ePaystackMonthly}
                onChange={(e) => setEPaystackMonthly(e.target.value)}
                placeholder="PLN_xxxxxxxx"
              />
            </label>
            <label className="text-sm">
              Paystack plan code (yearly)
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                value={ePaystackYearly}
                onChange={(e) => setEPaystackYearly(e.target.value)}
                placeholder="PLN_xxxxxxxx"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={eUpdateSubs} onChange={(e) => setEUpdateSubs(e.target.checked)} />
              When saving price changes, propagate to existing Paystack subscriptions (update_existing_subscriptions)
            </label>

            <div className="sm:col-span-2">
              <PlanFeatureEditor value={eFeatures} onChange={setEFeatures} />
            </div>

            <div className="sm:col-span-2 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">Public /pricing page (marketing)</h3>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={eShowPricing} onChange={(e) => setEShowPricing(e.target.checked)} />
                Show on public pricing page (creates or updates <code className="text-xs">pricing_plans</code> linked to this
                plan)
              </label>
              {eShowPricing ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">
                    Price label (shown on site, e.g. <code className="text-xs">R99</code>, <code className="text-xs">Free</code>,{" "}
                    <code className="text-xs">Custom</code>)
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                      value={ePriceDisplay}
                      onChange={(e) => setEPriceDisplay(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    Period label
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                      value={ePeriodDisplay}
                      onChange={(e) => setEPeriodDisplay(e.target.value)}
                      placeholder="month"
                    />
                  </label>
                  <label className="text-sm">
                    Card sort order
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                      value={eOrderPricing}
                      onChange={(e) => setEOrderPricing(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    Display currency (optional, e.g. ZAR)
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase"
                      value={ePricingCurrency}
                      onChange={(e) => setEPricingCurrency(e.target.value)}
                      placeholder="ZAR"
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Short description (marketing)
                    <textarea
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      rows={2}
                      value={eDescDisplay}
                      onChange={(e) => setEDescDisplay(e.target.value)}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    CTA button text
                    <input
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                      value={eCtaText}
                      onChange={(e) => setECtaText(e.target.value)}
                    />
                  </label>
                  <div className="text-sm sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Plan bullets (rich text → <code className="text-xs">pricing_plan_features.feature_text</code>)
                      </span>
                      <button
                        type="button"
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                        onClick={() => setEMarketingFeatures((prev) => [...prev, ""])}
                      >
                        Add bullet
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Bold, links, and lists; content is sanitized on save. Use the full Next.js{" "}
                      <code className="rounded bg-white px-1">/admin/plans</code> editor for a larger Quill toolbar if
                      needed.
                    </p>
                    <div className="mt-3 space-y-4">
                      {eMarketingFeatures.map((html, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <div className="flex flex-col gap-0.5 pt-1 shrink-0">
                            <button
                              type="button"
                              className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                              disabled={i === 0}
                              aria-label="Move up"
                              onClick={() => {
                                if (i === 0) return;
                                setEMarketingFeatures((prev) => {
                                  const next = [...prev];
                                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                  return next;
                                });
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                              disabled={i === eMarketingFeatures.length - 1}
                              aria-label="Move down"
                              onClick={() => {
                                if (i >= eMarketingFeatures.length - 1) return;
                                setEMarketingFeatures((prev) => {
                                  const next = [...prev];
                                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                                  return next;
                                });
                              }}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-700"
                              aria-label="Remove"
                              onClick={() =>
                                setEMarketingFeatures((prev) => prev.filter((_, j) => j !== i))
                              }
                            >
                              ×
                            </button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <RichTextEditor
                              value={html}
                              onChange={(next) =>
                                setEMarketingFeatures((prev) => {
                                  const copy = [...prev];
                                  copy[i] = next;
                                  return copy;
                                })
                              }
                              minHeightClassName="min-h-[100px]"
                              placeholder={`Bullet ${i + 1}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
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
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => closeEdit()}>
              Cancel
            </button>
          </div>
          {saveErr ? <p className="mt-2 text-sm text-red-600">{saveErr}</p> : null}
        </AdminPanel>
      ) : null}

      {pricingOnlyRows.length > 0 ? (
        <AdminPanel>
          <p className="mb-3 text-sm text-gray-700">
            These <strong>active</strong> marketing cards are missing a valid <code className="text-xs">subscription_plan_id</code>{" "}
            (or the ID does not match a loaded subscription product). They can still show on <strong>/pricing</strong> until you
            link or hide them. Orphan paid cards do <strong>not</strong> appear in the provider upgrade catalog until linked.
          </p>
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Issue</AdminTh>
                <AdminTh>Card name</AdminTh>
                <AdminTh>Price label</AdminTh>
                <AdminTh> </AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {pricingOnlyRows.map((row) => {
                const pp = row.pricing_plan ?? {};
                const reason = row.reason ?? "";
                const reasonLabel =
                  reason === "no_subscription_link"
                    ? "Not linked to a product"
                    : reason === "unknown_subscription_plan"
                      ? "Link points to missing product"
                      : reason;
                return (
                  <tr key={String(row.pricing_plan_id ?? pp.id ?? "")}>
                    <AdminTd className="text-xs text-amber-900">{reasonLabel}</AdminTd>
                    <AdminTd className="font-medium">{String(pp.name ?? "—")}</AdminTd>
                    <AdminTd className="text-xs">
                      {String(pp.price ?? "—")}
                      {pp.period ? ` ${String(pp.period)}` : ""}
                    </AdminTd>
                    <AdminTd>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="text-sm text-gray-900 underline" onClick={() => openPoEdit(row)}>
                          Link &amp; edit
                        </button>
                        <button
                          type="button"
                          className="text-sm text-amber-900 underline disabled:opacity-50"
                          disabled={hidePoCard.isPending}
                          onClick={() => {
                            const id = String(row.pricing_plan_id ?? row.pricing_plan?.id ?? "");
                            if (!id) return;
                            if (
                              confirm("Hide this card from /pricing? (Does not delete the row; you can link it again later.)")
                            ) {
                              hidePoCard.mutate(id);
                            }
                          }}
                        >
                          Hide from /pricing
                        </button>
                      </div>
                    </AdminTd>
                  </tr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        </AdminPanel>
      ) : null}

      {poEdit ? (
        <AdminPanel>
          <p className="mb-2 text-sm font-medium text-gray-900">Marketing-only or orphan pricing card</p>
          <p className="mb-3 text-xs text-gray-600">
            Link this row to a subscription product, adjust copy, and save bullets. This updates what providers see in the
            upgrade flow and what visitors see on the public /pricing page (when the card is active).
          </p>
          {rows.length === 0 ? (
            <p className="mb-3 text-sm text-amber-900">
              There are no subscription products in the merge yet — create a plan in this list first, then use “Link &amp; edit”
              again to attach this card to it.
            </p>
          ) : null}
          {poEdit.reason === "unknown_subscription_plan" && poEdit.orphan_subscription_plan_id ? (
            <p className="mb-3 text-xs text-amber-800">
              Stored link <code className="break-all rounded bg-amber-50 px-1">{String(poEdit.orphan_subscription_plan_id)}</code>{" "}
              did not resolve to a product in the merge — pick a valid product below and save.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Link to subscription product (billing) *
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
                value={poSubPlanId}
                onChange={(e) => setPoSubPlanId(e.target.value)}
              >
                <option value="">— Select a plan —</option>
                {rows.map((r) =>
                  r.id ? (
                    <option key={r.id} value={r.id}>
                      {r.name} ({String(r.is_free ? "free" : "paid")})
                    </option>
                  ) : null,
                )}
                {poSubPlanId && !rows.some((r) => r.id === poSubPlanId) ? (
                  <option value={poSubPlanId}>Unmatched ID (fix required)</option>
                ) : null}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Card title (on /pricing)
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={poName}
                onChange={(e) => setPoName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Price label
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={poPrice}
                onChange={(e) => setPoPrice(e.target.value)}
                placeholder="R99"
              />
            </label>
            <label className="text-sm">
              Period label
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={poPeriod}
                onChange={(e) => setPoPeriod(e.target.value)}
                placeholder="/month"
              />
            </label>
            <label className="text-sm">
              Display currency
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 uppercase"
                value={poCurrency}
                onChange={(e) => setPoCurrency(e.target.value)}
                placeholder="ZAR"
              />
            </label>
            <label className="text-sm">
              Card sort
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={poOrder}
                onChange={(e) => setPoOrder(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={poActive} onChange={(e) => setPoActive(e.target.checked)} />
              Active (shown on /pricing)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={poPopular} onChange={(e) => setPoPopular(e.target.checked)} />
              Popular
            </label>
            <label className="text-sm sm:col-span-2">
              Short description
              <textarea
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                rows={2}
                value={poDesc}
                onChange={(e) => setPoDesc(e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              CTA label
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={poCta}
                onChange={(e) => setPoCta(e.target.value)}
              />
            </label>
            <div className="text-sm sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Plan bullets (rich text → <code className="text-xs">pricing_plan_features</code>)
                </span>
                <button
                  type="button"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  onClick={() => setPoFeatures((p) => [...p, ""])}
                >
                  Add bullet
                </button>
              </div>
              <div className="mt-3 space-y-4">
                {poFeatures.map((html, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex shrink-0 flex-col gap-0.5 pt-1">
                      <button
                        type="button"
                        className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                        disabled={i === 0}
                        aria-label="Move up"
                        onClick={() => {
                          if (i === 0) return;
                          setPoFeatures((prev) => {
                            const n = [...prev];
                            [n[i - 1], n[i]] = [n[i], n[i - 1]];
                            return n;
                          });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                        disabled={i === poFeatures.length - 1}
                        aria-label="Move down"
                        onClick={() => {
                          if (i >= poFeatures.length - 1) return;
                          setPoFeatures((prev) => {
                            const n = [...prev];
                            [n[i], n[i + 1]] = [n[i + 1], n[i]];
                            return n;
                          });
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-700"
                        aria-label="Remove"
                        onClick={() => setPoFeatures((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <RichTextEditor
                        value={html}
                        onChange={(next) =>
                          setPoFeatures((prev) => {
                            const c = [...prev];
                            c[i] = next;
                            return c;
                          })
                        }
                        minHeightClassName="min-h-[100px]"
                        placeholder={`Bullet ${i + 1}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={savePoCard.isPending}
              onClick={() => void savePoCard.mutate()}
            >
              Save card
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              onClick={() => closePoEdit()}
            >
              Cancel
            </button>
          </div>
          {savePoCard.error instanceof Error ? (
            <p className="mt-2 text-sm text-red-600">{(savePoCard.error as Error).message}</p>
          ) : null}
        </AdminPanel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No plans"
          description={
            plansMeta?.empty_reason ??
            "No subscription plans were returned for this tenant/global scope. Create one here or check subscription_plans seed data."
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Monthly</AdminTh>
              <AdminTh>Yearly</AdminTh>
              <AdminTh>Free</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Provider catalog</AdminTh>
              <AdminTh>Public /pricing</AdminTh>
              <AdminTh>Paystack</AdminTh>
              <AdminTh> </AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const pp = r.pricing_plan;
              const publicLabel = pp?.id
                ? `${String(pp.price ?? "—")}${pp.period ? ` / ${String(pp.period)}` : ""}`
                : "—";
              return (
                <tr key={String(r.id)}>
                  <AdminTd className="font-medium">{String(r.name ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{r.price_monthly != null ? String(r.price_monthly) : "—"}</AdminTd>
                  <AdminTd className="tabular-nums">{r.price_yearly != null ? String(r.price_yearly) : "—"}</AdminTd>
                  <AdminTd>{r.is_free ? "yes" : "no"}</AdminTd>
                  <AdminTd>{r.is_active !== false ? "yes" : "no"}</AdminTd>
                  <AdminTd
                    className="text-xs"
                    title="Paid products need an active linked marketing card to appear in the in-app upgrade list. Free plans always show."
                  >
                    {providerCatalogLabel(r)}
                  </AdminTd>
                  <AdminTd className="max-w-[10rem] text-xs">
                    <span title={publicLabel}>{publicLabel}</span>
                  </AdminTd>
                  <AdminTd className="max-w-[8rem] truncate text-xs font-mono">
                    {r.paystack_plan_code_monthly || r.paystack_plan_code_yearly ? "codes set" : "—"}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-3">
                      <button type="button" className="text-sm text-gray-900 underline" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deletePlan.isPending}
                        className="text-sm text-red-600 underline disabled:opacity-50"
                        onClick={() => {
                          if (confirm(`Delete plan "${r.name ?? r.id}"? Providers with active subscriptions will keep access (plan deactivated).`))
                            deletePlan.mutate(String(r.id));
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

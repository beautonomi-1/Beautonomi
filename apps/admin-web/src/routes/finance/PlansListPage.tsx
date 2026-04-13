import { useEffect, useState } from "react";
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
import { adminToast } from "@/lib/adminToast";
import { useTenantFeatureFlags, TENANT_PAYMENT_FEATURE_KEYS } from "@/hooks/useTenantFeatureFlags";
import { publicEnv } from "@/config/publicEnv";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { isBlankHtmlContent } from "@/lib/pricingFeatureHtml";

type PricingPlanLink = {
  id?: string;
  price?: string;
  period?: string | null;
  description?: string | null;
  cta_text?: string;
  display_order?: number;
  is_active?: boolean;
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

function formatFeaturesJson(row: PlanRow): string {
  const f = row.features;
  if (f && typeof f === "object" && !Array.isArray(f)) {
    return JSON.stringify(f, null, 2);
  }
  return "{}";
}

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

  const webPlansEditorUrl = (() => {
    const base = (publicEnv.siteUrl || publicEnv.appUrl || "").replace(/\/$/, "");
    return base ? `${base}/admin/plans` : "";
  })();

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
  /** Entitlements / gating — JSON object stored on subscription_plans.features */
  const [eFeaturesJson, setEFeaturesJson] = useState("{}");
  /** Public /pricing marketing card (pricing_plans + pricing_plan_features) */
  const [eShowPricing, setEShowPricing] = useState(false);
  const [ePriceDisplay, setEPriceDisplay] = useState("");
  const [ePeriodDisplay, setEPeriodDisplay] = useState("month");
  const [eDescDisplay, setEDescDisplay] = useState("");
  const [eCtaText, setECtaText] = useState("Get started");
  const [eOrderPricing, setEOrderPricing] = useState("0");
  /** One rich-text row per `pricing_plan_features` line (HTML from WYSIWYG). */
  const [eMarketingFeatures, setEMarketingFeatures] = useState<string[]>([]);

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
        max_bookings_per_month: nMaxBookings.trim() ? parseInt(nMaxBookings, 10) : null,
        max_staff_members: nMaxStaff.trim() ? parseInt(nMaxStaff, 10) : null,
        features: {},
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
      setNMaxBookings("");
      setNMaxStaff("");
    },
  });

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("No plan selected");

      let featuresObj: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(eFeaturesJson || "{}") as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          featuresObj = parsed as Record<string, unknown>;
        } else {
          throw new Error("Features must be a JSON object (not an array).");
        }
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Invalid features JSON");
      }

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
    setEFeaturesJson(formatFeaturesJson(row));
    const pp = row.pricing_plan;
    setEShowPricing(!!pp?.id);
    setEPriceDisplay(String(pp?.price ?? ""));
    setEPeriodDisplay(pp?.period != null && pp.period !== "" ? String(pp.period) : "month");
    setEDescDisplay(pp?.description != null ? String(pp.description) : "");
    setECtaText(String(pp?.cta_text ?? "Get started"));
    setEOrderPricing(String(pp?.display_order ?? row.display_order ?? 0));
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
        description="Subscription plans control billing and in-app entitlements (feature JSON). The public /pricing page uses separate marketing rows (price label, bullets) linked to each plan when “Show on pricing page” is enabled."
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
              <strong>Feature permissions</strong> are the <code className="rounded bg-white px-1">features</code> JSON object
              (marketing_campaigns, booking_limits, multi_location, advanced_analytics, …). Edit the JSON carefully — invalid
              shapes may be ignored at runtime.
            </p>
            <p>
              <strong>Public /pricing</strong> uses <code className="rounded bg-white px-1">pricing_plans</code> + bullet lines
              in <code className="rounded bg-white px-1">pricing_plan_features</code>. Enable “Show on pricing page” to sync
              a marketing card; bullets are one line each in the text area.
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

            <label className="text-sm sm:col-span-2">
              Feature permissions (JSON object on subscription_plans.features)
              <textarea
                className="mt-1 w-full min-h-[180px] rounded border border-gray-300 px-2 py-2 font-mono text-xs"
                value={eFeaturesJson}
                onChange={(e) => setEFeaturesJson(e.target.value)}
                spellCheck={false}
              />
            </label>

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

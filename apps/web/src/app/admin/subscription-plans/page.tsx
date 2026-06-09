"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Edit,
  CreditCard,
  Gift,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import WysiwygEditor from "@/components/admin/WysiwygEditor";
import { isBlankHtmlContent } from "@/lib/html/pricing-feature-html-shared";
import {
  ALL_FEATURE_CATEGORY_KEYS,
  CALENDAR_PROVIDERS as CALENDAR_PROVIDER_OPTIONS,
  getFreePlanFeatures,
  MARKETING_CHANNELS as MARKETING_CHANNEL_OPTIONS,
  normalizeFeatures as normalizePlanFeatures,
  REPORT_TYPES as REPORT_TYPE_OPTIONS,
} from "@beautonomi/subscription-features";

/** Typed view for the legacy Next.js form; registry drives defaults and normalize. */
type FeatureCategoryForm = {
  enabled?: boolean;
  channels?: string[];
  providers?: string[];
  report_types?: string[];
  note?: string;
  max_campaigns_per_month?: number | null;
  max_recipients_per_campaign?: number | null;
  max_messages_per_month?: number | null;
  max_devices?: number | null;
  max_staff_members?: number | null;
  max_locations?: number | null;
  max_bookings_per_month?: number | null;
  max_automations?: number | null;
  max_links?: number | null;
  included_credit_zar_per_month?: number | null;
  advanced_segmentation?: boolean;
  custom_integrations?: boolean;
  file_attachments?: boolean;
  group_chats?: boolean;
  advanced_features?: boolean;
  basic_reports?: boolean;
  advanced_reports?: boolean;
  data_export?: boolean;
  api_access?: boolean;
  advanced_patterns?: boolean;
};

type FeatureGating = Record<string, FeatureCategoryForm>;

interface PricingPlanLink {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  cta_text: string;
  is_popular: boolean;
  display_order: number;
  subscription_plan_id: string | null;
  currency?: string | null;
  feature_lines?: string[];
}

interface PlansCatalogMeta {
  tenant_id?: string | null;
  subscription_plan_count?: number;
  pricing_plan_count?: number;
  active_pricing_plan_count?: number;
  pricing_only_active_count?: number;
  unlinked_subscription_plans_count?: number;
  empty_reason?: string | null;
  read_client?: string;
}

interface PricingOnlyRow {
  row_kind: "pricing_only";
  reason: "no_subscription_link" | "unknown_subscription_plan" | string;
  orphan_subscription_plan_id?: string | null;
  pricing_plan_id: string;
  pricing_plan: PricingPlanLink & { id?: string; is_active?: boolean; subscription_plan_id?: string | null };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  price_monthly?: number;
  price_yearly?: number;
  currency: string;
  features: FeatureGating | string[] | null; // Support both complex and legacy
  is_free: boolean;
  is_active: boolean;
  is_popular: boolean;
  display_order: number;
  max_bookings_per_month?: number | null;
  max_staff_members?: number | null;
  max_locations: number;
  paystack_plan_code_monthly?: string;
  paystack_plan_code_yearly?: string;
  created_at: string;
  updated_at: string;
  pricing_plan?: PricingPlanLink | null;
}

const getDefaultFeatures = (): FeatureGating => getFreePlanFeatures() as FeatureGating;

const MARKETING_CHANNELS = MARKETING_CHANNEL_OPTIONS.map((c) => c.value);
const CALENDAR_PROVIDERS = CALENDAR_PROVIDER_OPTIONS.map((p) => p.value);
const REPORT_TYPES = REPORT_TYPE_OPTIONS.map((r) => r.value);

/** Collapsible sections under Feature Gating (expand/collapse all). */
const ALL_FEATURE_COLLAPSE_KEYS = ALL_FEATURE_CATEGORY_KEYS;

type PlansPageProps = { useMergedPlans?: boolean };

export default function SubscriptionPlansPage({ useMergedPlans = false }: PlansPageProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pricingOnlyRows, setPricingOnlyRows] = useState<PricingOnlyRow[]>([]);
  const [plansMeta, setPlansMeta] = useState<PlansCatalogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price_monthly: "",
    price_yearly: "",
    currency: LAST_RESORT_CURRENCY as string,
    features: getDefaultFeatures(),
    is_free: false,
    is_active: true,
    is_popular: false,
    display_order: 0,
    max_bookings_per_month: "",
    max_staff_members: "",
    max_locations: "1",
    paystack_plan_code_monthly: "",
    paystack_plan_code_yearly: "",
    // Pricing page (public) - when useMergedPlans
    show_on_pricing_page: false,
    price_display: "",
    period_display: "month",
    description_display: "",
    cta_text: "Get started",
    display_order_pricing: 0,
    pricing_currency: "",
    pricing_features: [] as string[],
    update_existing_subscriptions: false,
  });

  /** When creating a subscription plan from a pricing-only card, link this pricing row after save. */
  const [linkPricingPlanId, setLinkPricingPlanId] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTargetPricingId, setLinkTargetPricingId] = useState<string | null>(null);
  const [linkSelectedSubscriptionId, setLinkSelectedSubscriptionId] = useState<string>("");

  const normalizeFeatures = (features: unknown): FeatureGating =>
    normalizePlanFeatures(features) as FeatureGating;

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const url = useMergedPlans ? "/api/admin/plans" : "/api/admin/subscription-plans";
      const response = await fetcher.get<{
        data:
          | SubscriptionPlan[]
          | {
              plans?: SubscriptionPlan[];
              pricing_only?: PricingOnlyRow[];
              meta?: PlansCatalogMeta;
            };
      }>(url, useMergedPlans ? { staleTimeMs: 0 } : undefined);
      const payload = response.data;
      if (useMergedPlans && payload && typeof payload === "object" && !Array.isArray(payload)) {
        setPlans(payload.plans ?? []);
        setPricingOnlyRows(
          Array.isArray(payload.pricing_only)
            ? (payload.pricing_only as PricingOnlyRow[])
            : [],
        );
        setPlansMeta((payload.meta as PlansCatalogMeta) ?? null);
      } else {
        setPlans(Array.isArray(payload) ? payload : (payload as { plans?: SubscriptionPlan[] })?.plans ?? []);
        setPricingOnlyRows([]);
        setPlansMeta(null);
      }
    } catch (error) {
      console.error("Error fetching plans:", error);
      toast.error("Failed to load subscription plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [useMergedPlans]);

  const handleCreate = () => {
    setSelectedPlan(null);
    setLinkPricingPlanId(null);
    setFormData({
      name: "",
      description: "",
      price_monthly: "",
      price_yearly: "",
      currency: LAST_RESORT_CURRENCY as string,
      features: getDefaultFeatures(),
      is_free: false,
      is_active: true,
      is_popular: false,
      display_order: plans.length,
      max_bookings_per_month: "",
      max_staff_members: "",
      max_locations: "1",
      paystack_plan_code_monthly: "",
      paystack_plan_code_yearly: "",
      show_on_pricing_page: false,
      price_display: "",
      period_display: "month",
      description_display: "",
      cta_text: "Get started",
      display_order_pricing: plans.length,
      pricing_currency: LAST_RESORT_CURRENCY as string,
      pricing_features: [],
      update_existing_subscriptions: false,
    });
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setLinkPricingPlanId(null);
    const normalizedFeatures = normalizeFeatures(plan.features);
    const pp = plan.pricing_plan;
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price_monthly: plan.price_monthly?.toString() || "",
      price_yearly: plan.price_yearly?.toString() || "",
      currency: plan.currency,
      features: normalizedFeatures,
      is_free: plan.is_free,
      is_active: plan.is_active,
      is_popular: plan.is_popular,
      display_order: plan.display_order,
      max_bookings_per_month: plan.max_bookings_per_month?.toString() || "",
      max_staff_members: plan.max_staff_members?.toString() || "",
      max_locations: plan.max_locations?.toString() || "1",
      paystack_plan_code_monthly: plan.paystack_plan_code_monthly || "",
      paystack_plan_code_yearly: plan.paystack_plan_code_yearly || "",
      show_on_pricing_page: !!pp,
      price_display: pp?.price || "",
      period_display: pp?.period || "month",
      description_display: pp?.description || "",
      cta_text: pp?.cta_text || "Get started",
      display_order_pricing: pp?.display_order ?? plan.display_order,
      pricing_currency: (pp?.currency as string | undefined) ?? plan.currency ?? "",
      pricing_features: Array.isArray(pp?.feature_lines) ? [...(pp!.feature_lines as string[])] : [],
      update_existing_subscriptions: false,
    });
    setIsEditDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...(selectedPlan ? { id: selectedPlan.id } : {}),
        name: formData.name,
        description: formData.description || undefined,
        price_monthly: formData.is_free ? undefined : parseFloat(formData.price_monthly) || undefined,
        price_yearly: formData.is_free ? undefined : parseFloat(formData.price_yearly) || undefined,
        currency: formData.currency,
        features: formData.features,
        is_free: formData.is_free,
        is_active: formData.is_active,
        is_popular: formData.is_popular,
        display_order: formData.display_order,
        max_bookings_per_month: formData.max_bookings_per_month ? parseInt(formData.max_bookings_per_month) : null,
        max_staff_members: formData.max_staff_members ? parseInt(formData.max_staff_members) : null,
        max_locations: parseInt(formData.max_locations) || 1,
        paystack_plan_code_monthly: formData.paystack_plan_code_monthly || null,
        paystack_plan_code_yearly: formData.paystack_plan_code_yearly || null,
        ...(selectedPlan && "update_existing_subscriptions" in formData
          ? { update_existing_subscriptions: (formData as any).update_existing_subscriptions }
          : {}),
      };

      let savedPlan: SubscriptionPlan;
      if (selectedPlan) {
        const res = await fetcher.put<{ data: SubscriptionPlan }>("/api/admin/subscription-plans", payload);
        savedPlan = res.data;
        toast.success("Plan updated successfully");
      } else {
        const res = await fetcher.post<{ data: SubscriptionPlan }>("/api/admin/subscription-plans", payload);
        savedPlan = res.data;
        toast.success("Plan created successfully");
      }

      // Link orphan pricing card → new subscription plan (pricing-only reconciliation)
      const linkedExistingPricingId =
        useMergedPlans && linkPricingPlanId && savedPlan?.id && !selectedPlan ? linkPricingPlanId : null;
      if (linkedExistingPricingId) {
        await fetcher.put("/api/admin/pricing-plans", {
          id: linkedExistingPricingId,
          subscription_plan_id: savedPlan.id,
          is_active: true,
        });
        setLinkPricingPlanId(null);
        toast.success("Pricing card linked to the new subscription plan");
      }

      // When consolidated view: sync pricing page entry so public pricing and onboarding use it
      // Skip creating a second pricing row when we just linked an existing pricing card.
      if (
        useMergedPlans &&
        formData.show_on_pricing_page &&
        savedPlan?.id &&
        !linkedExistingPricingId
      ) {
        const featureLines = formData.pricing_features.filter((s) => !isBlankHtmlContent(s));
        const pricingPayload = {
          ...(selectedPlan?.pricing_plan ? { id: selectedPlan.pricing_plan.id } : {}),
          name: formData.name,
          price: formData.price_display || (savedPlan.price_monthly != null ? String(savedPlan.price_monthly) : "0"),
          period: formData.period_display || null,
          description: formData.description_display || null,
          cta_text: formData.cta_text,
          is_popular: formData.is_popular,
          display_order: formData.display_order_pricing,
          is_active: savedPlan.is_active,
          subscription_plan_id: savedPlan.id,
          paystack_plan_code_monthly: savedPlan.paystack_plan_code_monthly || null,
          paystack_plan_code_yearly: savedPlan.paystack_plan_code_yearly || null,
          currency: formData.pricing_currency.trim() || null,
          features: featureLines,
        };
        if (selectedPlan?.pricing_plan) {
          await fetcher.put("/api/admin/pricing-plans", pricingPayload);
        } else {
          await fetcher.post("/api/admin/pricing-plans", pricingPayload);
        }
      } else if (useMergedPlans && !formData.show_on_pricing_page && selectedPlan?.pricing_plan) {
        // Unlink: deactivate or delete pricing plan so it no longer appears on public page
        await fetcher.put("/api/admin/pricing-plans", {
          id: selectedPlan.pricing_plan.id,
          is_active: false,
          subscription_plan_id: null,
        });
      }

      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      fetchPlans();
    } catch (error) {
      const errorMessage =
        error instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : error instanceof FetchError
          ? error.message
          : "Failed to save plan";
      toast.error(errorMessage);
      console.error("Error saving plan:", error);
    }
  };

  const handleCreateFromPricingOnly = (row: PricingOnlyRow) => {
    setSelectedPlan(null);
    setLinkPricingPlanId(row.pricing_plan_id);
    const pp = row.pricing_plan;
    const rawPrice = String(pp.price ?? "")
      .replace(/[^\d.,-]/g, "")
      .replace(",", ".");
    const num = parseFloat(rawPrice);
    setFormData({
      name: String(pp.name ?? ""),
      description: typeof pp.description === "string" ? pp.description : "",
      price_monthly: Number.isFinite(num) ? String(num) : "",
      price_yearly: "",
      currency: LAST_RESORT_CURRENCY as string,
      features: getDefaultFeatures(),
      is_free: false,
      is_active: true,
      is_popular: Boolean(pp.is_popular),
      display_order: plans.length,
      max_bookings_per_month: "",
      max_staff_members: "",
      max_locations: "1",
      paystack_plan_code_monthly: "",
      paystack_plan_code_yearly: "",
      show_on_pricing_page: true,
      price_display: String(pp.price ?? ""),
      period_display: pp.period || "month",
      description_display: typeof pp.description === "string" ? pp.description : "",
      cta_text: pp.cta_text || "Get started",
      display_order_pricing: typeof pp.display_order === "number" ? pp.display_order : plans.length,
      pricing_currency: (pp.currency as string | undefined) ?? LAST_RESORT_CURRENCY,
      pricing_features: Array.isArray(pp.feature_lines) ? [...(pp.feature_lines as string[])] : [],
      update_existing_subscriptions: false,
    });
    setIsCreateDialogOpen(true);
  };

  const openLinkPricingDialog = (pricingPlanId: string) => {
    if (!plans.length) {
      toast.error("Create a subscription plan first, then link this card.");
      return;
    }
    setLinkTargetPricingId(pricingPlanId);
    setLinkSelectedSubscriptionId(plans[0]?.id ?? "");
    setLinkDialogOpen(true);
  };

  const confirmLinkPricingToSubscription = async () => {
    if (!linkTargetPricingId || !linkSelectedSubscriptionId) {
      toast.error("Select a subscription plan to link");
      return;
    }
    try {
      await fetcher.put("/api/admin/pricing-plans", {
        id: linkTargetPricingId,
        subscription_plan_id: linkSelectedSubscriptionId,
        is_active: true,
      });
      toast.success("Pricing card linked");
      setLinkDialogOpen(false);
      setLinkTargetPricingId(null);
      await fetchPlans();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to link");
    }
  };

  const hidePricingCardFromPublic = async (pricingPlanId: string) => {
    try {
      await fetcher.put("/api/admin/pricing-plans", {
        id: pricingPlanId,
        is_active: false,
        subscription_plan_id: null,
      });
      toast.success("Card hidden from public pricing (deactivated)");
      await fetchPlans();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to update pricing card");
    }
  };

  const updateFeature = (category: keyof FeatureGating, updates: any) => {
    setFormData((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [category]: {
          ...prev.features[category],
          ...updates,
        },
      },
    }));
  };

  const toggleFeatureCategory = (category: keyof FeatureGating) => {
    const current = formData.features[category];
    updateFeature(category, { enabled: !current?.enabled });
  };

  const toggleArrayItem = (category: keyof FeatureGating, field: string, item: string) => {
    const current = formData.features[category] as any;
    const currentArray = (current?.[field] as string[]) || [];
    const newArray = currentArray.includes(item)
      ? currentArray.filter((i) => i !== item)
      : [...currentArray, item];
    updateFeature(category, { [field]: newArray });
  };

  const getFeatureSummary = (plan: SubscriptionPlan): string => {
    const features = normalizeFeatures(plan.features);
    const enabled = Object.values(features).filter(
      (f) =>
        typeof f === "object" &&
        f !== null &&
        (f as { enabled?: boolean }).enabled === true,
    ).length;
    const total = Object.keys(features).length;
    return `${enabled}/${total} enabled`;
  };

  const expandAllFeatureSections = () => {
    setExpandedFeatures((prev) => {
      const next = { ...prev };
      ALL_FEATURE_COLLAPSE_KEYS.forEach((k) => {
        next[k] = true;
      });
      return next;
    });
  };

  const collapseAllFeatureSections = () => {
    setExpandedFeatures((prev) => {
      const next = { ...prev };
      ALL_FEATURE_COLLAPSE_KEYS.forEach((k) => {
        next[k] = false;
      });
      return next;
    });
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <LoadingTimeout loadingMessage={useMergedPlans ? "Loading plans..." : "Loading subscription plans..."} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {useMergedPlans ? "Plans" : "Subscription Plans"}
            </h1>
            <p className="text-gray-600 mt-1">
              {useMergedPlans
                ? "Manage subscription tiers, feature access, and public pricing page in one place"
                : "Manage subscription tiers and feature access with granular controls"}
            </p>
            {useMergedPlans && (
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                Public <Link className="text-[#FF0077] underline font-medium" href="/pricing">/pricing</Link>{" "}
                hero line (e.g. free trial wording) is{" "}
                <strong>not</strong> driven by these rows — edit{" "}
                <Link className="text-[#FF0077] underline font-medium" href="/admin/content">
                  Admin → Content
                </Link>{" "}
                page slug <code className="text-xs bg-muted px-1 rounded">pricing</code>, section{" "}
                <code className="text-xs bg-muted px-1 rounded">hero_description</code>.
              </p>
            )}
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Plan
          </Button>
        </div>

        {useMergedPlans && plansMeta && (
          <Alert variant={plansMeta.pricing_only_active_count ? "destructive" : "default"}>
            {plansMeta.pricing_only_active_count ? (
              <AlertTriangle className="h-4 w-4" aria-hidden />
            ) : null}
            <AlertTitle>Catalog diagnostics</AlertTitle>
            <AlertDescription className="space-y-1 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Reads: {plansMeta.read_client ?? "service_role"}</span>
                <span>Subscription plans: {plansMeta.subscription_plan_count ?? plans.length}</span>
                <span>Pricing plans: {plansMeta.pricing_plan_count ?? "—"}</span>
                <span>Active pricing cards: {plansMeta.active_pricing_plan_count ?? "—"}</span>
                <span>Pricing-only (unlinked): {plansMeta.pricing_only_active_count ?? pricingOnlyRows.length}</span>
              </div>
              {plansMeta.empty_reason ? (
                <p className="text-amber-800 dark:text-amber-200 mt-2">{plansMeta.empty_reason}</p>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        {plans.length === 0 && (!useMergedPlans || pricingOnlyRows.length === 0) ? (
          <EmptyState
            title={useMergedPlans ? "No plans" : "No subscription plans"}
            description={useMergedPlans ? "Create your first plan to get started" : "Create your first subscription plan to get started"}
            action={{
              label: "Create Plan",
              onClick: handleCreate,
            }}
          />
        ) : null}

        {plans.length > 0 ? (
          <div className="bg-white rounded-lg border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {useMergedPlans && <TableHead>On pricing page</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paystack</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {plan.name}
                        {plan.is_popular && (
                          <Badge variant="secondary" className="bg-pink-100 text-pink-800">
                            Popular
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {useMergedPlans && (
                      <TableCell>
                        {plan.pricing_plan ? (
                          <Badge variant="outline" className="bg-green-50 text-green-800">Yes</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-amber-900 bg-amber-50">
                            No public card
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {plan.is_free ? (
                        <Badge className="bg-green-100 text-green-800">
                          <Gift className="w-3 h-3 mr-1" />
                          Free
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <CreditCard className="w-3 h-3 mr-1" />
                          Paid
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.is_free ? (
                        <span className="text-gray-500">Free</span>
                      ) : (
                        <div className="text-sm">
                          {plan.price_monthly && (
                            <div>
                              {plan.currency} {plan.price_monthly}/mo
                            </div>
                          )}
                          {plan.price_yearly && (
                            <div className="text-gray-500">
                              {plan.currency} {plan.price_yearly}/yr
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {getFeatureSummary(plan)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {plan.max_bookings_per_month
                          ? `${plan.max_bookings_per_month} bookings/mo`
                          : "Unlimited"}
                        <br />
                        {plan.max_staff_members
                          ? `${plan.max_staff_members} staff`
                          : "Unlimited staff"}
                        <br />
                        {plan.max_locations} location{plan.max_locations !== 1 ? "s" : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-500">
                        {plan.paystack_plan_code_monthly && (
                          <div>Monthly: {plan.paystack_plan_code_monthly.slice(0, 8)}...</div>
                        )}
                        {plan.paystack_plan_code_yearly && (
                          <div>Yearly: {plan.paystack_plan_code_yearly.slice(0, 8)}...</div>
                        )}
                        {!plan.paystack_plan_code_monthly && !plan.paystack_plan_code_yearly && (
                          <span>Not synced</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {useMergedPlans && pricingOnlyRows.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden />
              Pricing-only cards (not linked to a subscription plan)
            </h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              These active <code className="text-xs bg-muted px-1 rounded">pricing_plans</code> rows can still
              appear on <Link href="/pricing" className="text-[#FF0077] underline">/pricing</Link> while{" "}
              <code className="text-xs bg-muted px-1 rounded">subscription_plans</code> is empty or the link is
              broken. Reconcile so provider billing and marketing stay aligned.
            </p>
            <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Public card</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Display</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricingOnlyRows.map((row) => {
                    const pp = row.pricing_plan;
                    return (
                      <TableRow key={row.pricing_plan_id}>
                        <TableCell className="font-medium">{pp.name}</TableCell>
                        <TableCell className="text-sm">
                          {row.reason === "no_subscription_link"
                            ? "No subscription_plan_id"
                            : `Unknown subscription id: ${row.orphan_subscription_plan_id ?? "—"}`}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {pp.price} {pp.period ? `/ ${pp.period}` : ""}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="default" onClick={() => handleCreateFromPricingOnly(row)}>
                              Create subscription from card
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => openLinkPricingDialog(row.pricing_plan_id)}>
                              <Link2 className="w-3 h-3 mr-1" aria-hidden />
                              Link to existing
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => hidePricingCardFromPublic(row.pricing_plan_id)}
                            >
                              Hide from /pricing
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        <Dialog
          open={linkDialogOpen}
          onOpenChange={(open) => {
            setLinkDialogOpen(open);
            if (!open) setLinkTargetPricingId(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Link pricing card to subscription plan</DialogTitle>
              <DialogDescription>
                Sets <code className="text-xs">subscription_plan_id</code> on the pricing row so /pricing and
                provider upgrade flows use the same catalog.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Subscription plan</Label>
              <Select value={linkSelectedSubscriptionId} onValueChange={setLinkSelectedSubscriptionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.is_free ? "(free)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmLinkPricingToSubscription()}>Save link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Dialog */}
        <Dialog
          open={isCreateDialogOpen || isEditDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setIsEditDialogOpen(false);
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPlan ? (useMergedPlans ? "Edit Plan" : "Edit Subscription Plan") : (useMergedPlans ? "Create Plan" : "Create Subscription Plan")}
              </DialogTitle>
              <DialogDescription>
                {useMergedPlans
                  ? "Configure billing, feature access, and optional public pricing page entry"
                  : "Configure subscription tier with pricing, Paystack integration, and granular feature access"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4 border-b pb-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Plan Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="e.g., Basic, Professional, Enterprise"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={formData.currency}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Plan description..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_free"
                    checked={formData.is_free}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_free: checked })
                    }
                  />
                  <Label htmlFor="is_free">Free Tier (no payment required)</Label>
                </div>

                {!formData.is_free && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price_monthly">Monthly Price</Label>
                      <Input
                        id="price_monthly"
                        type="number"
                        step="0.01"
                        value={formData.price_monthly}
                        onChange={(e) =>
                          setFormData({ ...formData, price_monthly: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="price_yearly">Yearly Price</Label>
                      <Input
                        id="price_yearly"
                        type="number"
                        step="0.01"
                        value={formData.price_yearly}
                        onChange={(e) =>
                          setFormData({ ...formData, price_yearly: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                {selectedPlan && !formData.is_free && (
                  <div className="flex items-center space-x-2 rounded-md border p-3 bg-muted/30">
                    <Checkbox
                      id="update_existing_subscriptions"
                      checked={(formData as any).update_existing_subscriptions ?? false}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, update_existing_subscriptions: !!checked })
                      }
                    />
                    <Label htmlFor="update_existing_subscriptions" className="text-sm font-normal cursor-pointer">
                      Apply price/name changes to existing Paystack subscriptions (takes effect next billing cycle)
                    </Label>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="max_bookings">Max Bookings/Month</Label>
                    <Input
                      id="max_bookings"
                      type="number"
                      value={formData.max_bookings_per_month}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_bookings_per_month: e.target.value,
                        })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_staff">Max Staff Members</Label>
                    <Input
                      id="max_staff"
                      type="number"
                      value={formData.max_staff_members}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_staff_members: e.target.value,
                        })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_locations">Max Locations</Label>
                    <Input
                      id="max_locations"
                      type="number"
                      value={formData.max_locations}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_locations: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_popular"
                      checked={formData.is_popular}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_popular: checked })
                      }
                    />
                    <Label htmlFor="is_popular">Mark as Popular</Label>
                  </div>
                </div>

                <div>
                  <Label htmlFor="display_order">Display Order</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        display_order: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                {/* Public pricing page (consolidated Plans only) */}
                {useMergedPlans && (
                  <div className="space-y-4 border-t pt-4 mt-4">
                    <h4 className="font-semibold text-base">Public pricing page</h4>
                    <p className="text-sm text-gray-500">
                      When enabled, this plan appears on the public pricing page and in provider onboarding. Paystack codes are synced from this plan.
                    </p>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="show_on_pricing_page"
                        checked={formData.show_on_pricing_page}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, show_on_pricing_page: checked })
                        }
                      />
                      <Label htmlFor="show_on_pricing_page">Show on public pricing page</Label>
                    </div>
                    {formData.show_on_pricing_page && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="price_display">Price (display text)</Label>
                          <Input
                            id="price_display"
                            value={formData.price_display}
                            onChange={(e) =>
                              setFormData({ ...formData, price_display: e.target.value })
                            }
                            placeholder="e.g. 199 or Free"
                          />
                        </div>
                        <div>
                          <Label htmlFor="period_display">Period (display)</Label>
                          <Input
                            id="period_display"
                            value={formData.period_display}
                            onChange={(e) =>
                              setFormData({ ...formData, period_display: e.target.value })
                            }
                            placeholder="e.g. month, year"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="description_display">Short description (pricing page)</Label>
                          <Textarea
                            id="description_display"
                            value={formData.description_display}
                            onChange={(e) =>
                              setFormData({ ...formData, description_display: e.target.value })
                            }
                            placeholder="Optional"
                            rows={2}
                          />
                        </div>
                        <div>
                          <Label htmlFor="cta_text">Button text</Label>
                          <Input
                            id="cta_text"
                            value={formData.cta_text}
                            onChange={(e) =>
                              setFormData({ ...formData, cta_text: e.target.value })
                            }
                            placeholder="Get started"
                          />
                        </div>
                        <div>
                          <Label htmlFor="display_order_pricing">Order on pricing page</Label>
                          <Input
                            id="display_order_pricing"
                            type="number"
                            value={formData.display_order_pricing}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                display_order_pricing: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="pricing_currency">Currency label (public card)</Label>
                          <Input
                            id="pricing_currency"
                            value={formData.pricing_currency}
                            onChange={(e) =>
                              setFormData({ ...formData, pricing_currency: e.target.value })
                            }
                            placeholder="e.g. ZAR"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Shown under the plan name on /pricing. Billing currency for Paystack is the subscription
                            plan field above.
                          </p>
                        </div>
                        <div className="col-span-2 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label className="text-base">Plan features (public pricing page)</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  pricing_features: [...prev.pricing_features, ""],
                                }))
                              }
                            >
                              <Plus className="w-4 h-4 mr-1" aria-hidden />
                              Add feature
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500">
                            Each row is one bullet on /pricing. Use the rich editor for bold, links, and lists (stored as
                            safe HTML in <code className="text-xs">pricing_plan_features</code>).
                          </p>
                          {formData.pricing_features.length === 0 ? (
                            <p className="text-sm text-gray-500 border border-dashed rounded-lg p-4 text-center">
                              No features yet. Click &quot;Add feature&quot; to add the first bullet.
                            </p>
                          ) : (
                            <ul className="space-y-2 list-none">
                              {formData.pricing_features.map((line, i) => (
                                <li key={i} className="flex gap-2 items-start">
                                  <div className="flex flex-col gap-0.5 pt-1 shrink-0">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={i === 0}
                                      aria-label="Move up"
                                      onClick={() => {
                                        if (i === 0) return;
                                        const next = [...formData.pricing_features];
                                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                        setFormData({ ...formData, pricing_features: next });
                                      }}
                                    >
                                      <ArrowUp className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={i === formData.pricing_features.length - 1}
                                      aria-label="Move down"
                                      onClick={() => {
                                        if (i >= formData.pricing_features.length - 1) return;
                                        const next = [...formData.pricing_features];
                                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                                        setFormData({ ...formData, pricing_features: next });
                                      }}
                                    >
                                      <ArrowDown className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      aria-label="Remove this feature"
                                      onClick={() => {
                                        const next = formData.pricing_features.filter((_, j) => j !== i);
                                        setFormData({ ...formData, pricing_features: next });
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <WysiwygEditor
                                      compact
                                      value={line}
                                      onChange={(next) => {
                                        const copy = [...formData.pricing_features];
                                        copy[i] = next;
                                        setFormData({ ...formData, pricing_features: copy });
                                      }}
                                      placeholder={`Feature ${i + 1}…`}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="text-xs text-gray-500 pt-2 border-t">
                            Site-wide note under the hero (e.g. &quot;Prices in ZAR&quot;): Admin → Content → page{" "}
                            <strong>pricing</strong>, section <strong>currency_note</strong>.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Paystack Plan Codes */}
                <div className="space-y-4 border-t pt-4 mt-4">
                  <h4 className="font-semibold text-base">Paystack Integration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="paystack_plan_code_monthly">Paystack Plan Code (Monthly)</Label>
                      <Input
                        id="paystack_plan_code_monthly"
                        value={formData.paystack_plan_code_monthly}
                        onChange={(e) =>
                          setFormData({ ...formData, paystack_plan_code_monthly: e.target.value })
                        }
                        placeholder="PLN_xxxxx"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Get this from your Paystack dashboard
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="paystack_plan_code_yearly">Paystack Plan Code (Yearly)</Label>
                      <Input
                        id="paystack_plan_code_yearly"
                        value={formData.paystack_plan_code_yearly}
                        onChange={(e) =>
                          setFormData({ ...formData, paystack_plan_code_yearly: e.target.value })
                        }
                        placeholder="PLN_xxxxx"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Get this from your Paystack dashboard
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature Gating */}
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">Feature Gating</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Full <code className="text-xs bg-muted px-1 rounded">subscription_plans.features</code> map:
                      product API gates below, then marketing and integrations. Keys align with{" "}
                      <code className="text-xs bg-muted px-1 rounded">feature-access.ts</code> and provider routes.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button type="button" variant="outline" size="sm" onClick={expandAllFeatureSections}>
                      Expand all
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={collapseAllFeatureSections}>
                      Collapse all
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 border rounded-lg p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Product &amp; API gates</p>

                  <Collapsible
                    open={expandedFeatures.intake_forms}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, intake_forms: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.intake_forms ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <div>
                            <Label className="font-medium">Intake, consent &amp; waiver forms</Label>
                            <p className="text-xs text-gray-500 font-normal">Key: intake_forms</p>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.intake_forms?.enabled ?? true}
                        onCheckedChange={() => toggleFeatureCategory("intake_forms")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-2">
                      <p className="text-xs text-gray-500">
                        When disabled, provider APIs block creating or editing forms (consent, waiver, intake).
                      </p>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible
                    open={expandedFeatures.service_resources}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, service_resources: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.service_resources ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <div>
                            <Label className="font-medium">Service resources (rooms, chairs, equipment)</Label>
                            <p className="text-xs text-gray-500 font-normal">Key: service_resources</p>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.service_resources?.enabled ?? true}
                        onCheckedChange={() => toggleFeatureCategory("service_resources")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-2">
                      <p className="text-xs text-gray-500">
                        When disabled, providers cannot manage resources or attach them to services.
                      </p>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible
                    open={expandedFeatures.staff_sms_notifications}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, staff_sms_notifications: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.staff_sms_notifications ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <div>
                            <Label className="font-medium">Staff operational SMS</Label>
                            <p className="text-xs text-gray-500 font-normal">Key: staff_sms_notifications</p>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.staff_sms_notifications?.enabled ?? false}
                        onCheckedChange={() => toggleFeatureCategory("staff_sms_notifications")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-2">
                      <p className="text-xs text-gray-500">
                        When enabled, team notification settings may include SMS for staff. When off or missing, SMS is
                        not offered (stricter than other flags).
                      </p>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible
                    open={expandedFeatures.platform_ads}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, platform_ads: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.platform_ads ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <div>
                            <Label className="font-medium">Platform ads (included credit)</Label>
                            <p className="text-xs text-gray-500 font-normal">Key: platform_ads</p>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.platform_ads?.enabled ?? false}
                        onCheckedChange={() => toggleFeatureCategory("platform_ads")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <p className="text-xs text-gray-500">
                        Optional monthly ad credit (ZAR) bundled with the plan, where the ads product is enabled.
                      </p>
                      <div>
                        <Label className="text-sm">Included credit (ZAR / month)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="mt-1"
                          value={
                            formData.features.platform_ads?.included_credit_zar_per_month ?? ""
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            updateFeature("platform_ads", {
                              included_credit_zar_per_month: v === "" ? null : Number(v),
                            });
                          }}
                          placeholder="e.g. 500"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Internal note</Label>
                        <Textarea
                          className="mt-1 min-h-[4rem] text-sm"
                          value={formData.features.platform_ads?.note ?? ""}
                          onChange={(e) =>
                            updateFeature("platform_ads", { note: e.target.value })
                          }
                          placeholder="Optional note for admins"
                          rows={3}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <div className="border-t pt-3 mt-1">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Marketing &amp; integrations
                    </p>
                  </div>

                  {/* Marketing Campaigns */}
                  <Collapsible
                    open={expandedFeatures.marketing_campaigns}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, marketing_campaigns: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.marketing_campaigns ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Marketing Campaigns</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.marketing_campaigns?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("marketing_campaigns")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Channels</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {MARKETING_CHANNELS.map((channel) => (
                            <div key={channel} className="flex items-center space-x-1">
                              <Checkbox
                                checked={formData.features.marketing_campaigns?.channels?.includes(channel) || false}
                                onCheckedChange={() =>
                                  toggleArrayItem("marketing_campaigns", "channels", channel)
                                }
                              />
                              <Label className="text-sm font-normal">{channel}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-sm">Max Campaigns/Month</Label>
                          <Input
                            type="number"
                            value={formData.features.marketing_campaigns?.max_campaigns_per_month || ""}
                            onChange={(e) =>
                              updateFeature("marketing_campaigns", {
                                max_campaigns_per_month: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="Unlimited"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Max Recipients/Campaign</Label>
                          <Input
                            type="number"
                            value={formData.features.marketing_campaigns?.max_recipients_per_campaign || ""}
                            onChange={(e) =>
                              updateFeature("marketing_campaigns", {
                                max_recipients_per_campaign: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="Unlimited"
                          />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.marketing_campaigns?.advanced_segmentation || false}
                          onCheckedChange={(checked) =>
                            updateFeature("marketing_campaigns", { advanced_segmentation: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Segmentation</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.marketing_campaigns?.custom_integrations || false}
                          onCheckedChange={(checked) =>
                            updateFeature("marketing_campaigns", { custom_integrations: checked })
                          }
                        />
                        <Label className="text-sm">Custom Integrations</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Chat Messages */}
                  <Collapsible
                    open={expandedFeatures.chat_messages}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, chat_messages: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.chat_messages ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Chat Messages</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.chat_messages?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("chat_messages")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Max Messages/Month</Label>
                        <Input
                          type="number"
                          value={formData.features.chat_messages?.max_messages_per_month || ""}
                          onChange={(e) =>
                            updateFeature("chat_messages", {
                              max_messages_per_month: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.chat_messages?.file_attachments || false}
                          onCheckedChange={(checked) =>
                            updateFeature("chat_messages", { file_attachments: checked })
                          }
                        />
                        <Label className="text-sm">File Attachments</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.chat_messages?.group_chats || false}
                          onCheckedChange={(checked) =>
                            updateFeature("chat_messages", { group_chats: checked })
                          }
                        />
                        <Label className="text-sm">Group Chats</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Yoco Integration */}
                  <Collapsible
                    open={expandedFeatures.yoco_integration}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, yoco_integration: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.yoco_integration ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Yoco Integration</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.yoco_integration?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("yoco_integration")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Max Devices</Label>
                        <Input
                          type="number"
                          value={formData.features.yoco_integration?.max_devices || ""}
                          onChange={(e) =>
                            updateFeature("yoco_integration", {
                              max_devices: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.yoco_integration?.advanced_features || false}
                          onCheckedChange={(checked) =>
                            updateFeature("yoco_integration", { advanced_features: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Features</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Staff Management */}
                  <Collapsible
                    open={expandedFeatures.staff_management}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, staff_management: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.staff_management ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Staff Management</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.staff_management?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("staff_management")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Staff Members</Label>
                        <Input
                          type="number"
                          value={formData.features.staff_management?.max_staff_members || ""}
                          onChange={(e) =>
                            updateFeature("staff_management", {
                              max_staff_members: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Multi Location */}
                  <Collapsible
                    open={expandedFeatures.multi_location}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, multi_location: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.multi_location ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Multi Location</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.multi_location?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("multi_location")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Locations</Label>
                        <Input
                          type="number"
                          value={formData.features.multi_location?.max_locations || ""}
                          onChange={(e) =>
                            updateFeature("multi_location", {
                              max_locations: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Booking Limits */}
                  <Collapsible
                    open={expandedFeatures.booking_limits}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, booking_limits: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.booking_limits ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Booking Limits</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.booking_limits?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("booking_limits")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Bookings/Month</Label>
                        <Input
                          type="number"
                          value={formData.features.booking_limits?.max_bookings_per_month || ""}
                          onChange={(e) =>
                            updateFeature("booking_limits", {
                              max_bookings_per_month: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Advanced Analytics */}
                  <Collapsible
                    open={expandedFeatures.advanced_analytics}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, advanced_analytics: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.advanced_analytics ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Advanced Analytics</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.advanced_analytics?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("advanced_analytics")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.basic_reports || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { basic_reports: checked })
                          }
                        />
                        <Label className="text-sm">Basic Reports</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.advanced_reports || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { advanced_reports: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Reports</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.data_export || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { data_export: checked })
                          }
                        />
                        <Label className="text-sm">Data Export</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.advanced_analytics?.api_access || false}
                          onCheckedChange={(checked) =>
                            updateFeature("advanced_analytics", { api_access: checked })
                          }
                        />
                        <Label className="text-sm">API Access</Label>
                      </div>
                      <div>
                        <Label className="text-sm">Report Types</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {REPORT_TYPES.map((type) => (
                            <div key={type} className="flex items-center space-x-1">
                              <Checkbox
                                checked={formData.features.advanced_analytics?.report_types?.includes(type) || false}
                                onCheckedChange={() =>
                                  toggleArrayItem("advanced_analytics", "report_types", type)
                                }
                              />
                              <Label className="text-sm font-normal">{type}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Marketing Automations */}
                  <Collapsible
                    open={expandedFeatures.marketing_automations}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, marketing_automations: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.marketing_automations ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Marketing Automations</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.marketing_automations?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("marketing_automations")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Automations</Label>
                        <Input
                          type="number"
                          value={formData.features.marketing_automations?.max_automations || ""}
                          onChange={(e) =>
                            updateFeature("marketing_automations", {
                              max_automations: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Recurring Appointments */}
                  <Collapsible
                    open={expandedFeatures.recurring_appointments}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, recurring_appointments: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.recurring_appointments ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Recurring Appointments</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.recurring_appointments?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("recurring_appointments")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.recurring_appointments?.advanced_patterns || false}
                          onCheckedChange={(checked) =>
                            updateFeature("recurring_appointments", { advanced_patterns: checked })
                          }
                        />
                        <Label className="text-sm">Advanced Patterns</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Express Booking */}
                  <Collapsible
                    open={expandedFeatures.express_booking}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, express_booking: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.express_booking ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Express Booking</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.express_booking?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("express_booking")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2">
                      <div>
                        <Label className="text-sm">Max Links</Label>
                        <Input
                          type="number"
                          value={formData.features.express_booking?.max_links || ""}
                          onChange={(e) =>
                            updateFeature("express_booking", {
                              max_links: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                          placeholder="Unlimited"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Calendar Sync */}
                  <Collapsible
                    open={expandedFeatures.calendar_sync}
                    onOpenChange={(open) =>
                      setExpandedFeatures({ ...expandedFeatures, calendar_sync: open })
                    }
                  >
                    <div className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center space-x-2 cursor-pointer">
                          {expandedFeatures.calendar_sync ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <Label className="font-medium">Calendar Sync</Label>
                        </div>
                      </CollapsibleTrigger>
                      <Switch
                        checked={formData.features.calendar_sync?.enabled || false}
                        onCheckedChange={() => toggleFeatureCategory("calendar_sync")}
                      />
                    </div>
                    <CollapsibleContent className="pl-6 pr-2 pb-2 space-y-3">
                      <div>
                        <Label className="text-sm">Providers</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {CALENDAR_PROVIDERS.map((provider) => (
                            <div key={provider} className="flex items-center space-x-1">
                              <Checkbox
                                checked={formData.features.calendar_sync?.providers?.includes(provider) || false}
                                onCheckedChange={() =>
                                  toggleArrayItem("calendar_sync", "providers", provider)
                                }
                              />
                              <Label className="text-sm font-normal">{provider}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.features.calendar_sync?.api_access || false}
                          onCheckedChange={(checked) =>
                            updateFeature("calendar_sync", { api_access: checked })
                          }
                        />
                        <Label className="text-sm">API Access</Label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setIsEditDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit}>
                {selectedPlan ? "Update Plan" : "Create Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

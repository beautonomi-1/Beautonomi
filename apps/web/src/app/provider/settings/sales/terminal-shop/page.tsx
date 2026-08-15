"use client";

/**
 * /provider/settings/sales/terminal-shop
 * Storefront for Beautonomi card machines: browse the catalog, place orders,
 * pay via Paystack, track fulfillment, and jump to activation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  MapPin,
  Package,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  validateTerminalOrderFulfillment,
  type TerminalFulfillmentType,
} from "@/lib/terminal/terminal-order-fulfillment";
import {
  canConfirmTerminalCheckout,
  parseHighlightedOrderId,
  resolveTerminalShopOrderCta,
} from "@/lib/terminal/terminal-shop-cta";
import {
  getTerminalOrderProgressSteps,
  resolveTerminalOrderPrimaryAction,
} from "@/lib/terminal/terminal-order-progress";
import { resolveIntegrationSetupPath } from "@/lib/terminal/resolve-integration-setup-url";
import { usePermissions } from "@/hooks/usePermissions";
import {
  TERMINAL_ASSET_OWNERSHIP_LABELS,
  TERMINAL_COMMERCIAL_MODEL_LABELS,
  type TerminalCommercialModel,
} from "@/lib/terminal/types";

type CheckoutOption = {
  commercial_model: string;
  label: string;
  price: number | null;
  currency: string;
  requires_payment: boolean;
  description?: string;
};

type TerminalProduct = {
  id: string;
  name: string;
  vendor: string;
  model: string | null;
  description: string | null;
  image_url: string | null;
  currency: string;
  upfront_price: number | null;
  monthly_price: number | null;
  rental_price: number | null;
  stock_status: string;
  fulfillment_type?: string | null;
  requires_integration_setup?: boolean;
  checkout_options?: CheckoutOption[];
};

type TerminalOrder = {
  id: string;
  order_status: string;
  invoice_status: string;
  commercial_model: string;
  total_amount: number;
  currency: string;
  created_at: string;
  paystack_reference: string | null;
  fulfillment_type?: string | null;
  fulfillment_status?: string | null;
  integration_setup_status?: string | null;
  integration_setup_url?: string | null;
  tracking_reference?: string | null;
  courier_name?: string | null;
  terminal_products?: { name?: string; vendor?: string; integration_vendor_slug?: string | null };
  terminal_collection_locations?: { name?: string } | null;
};

type TerminalAsset = {
  id: string;
  serial_number: string | null;
  status: string;
  ownership_model: string;
  terminal_products?: { name?: string; vendor?: string };
};

type CollectionLocation = {
  id: string;
  name: string;
  address: Record<string, unknown>;
};

type DeliveryForm = {
  line1: string;
  line2: string;
  city: string;
  province: string;
  postal_code: string;
  contact_name: string;
  contact_phone: string;
};

const EMPTY_DELIVERY: DeliveryForm = {
  line1: "",
  line2: "",
  city: "",
  province: "",
  postal_code: "",
  contact_name: "",
  contact_phone: "",
};

const FULFILLMENT_META: Record<string, { label: string; Icon: typeof Truck }> = {
  shipping: { label: "Shipped to you", Icon: Truck },
  courier: { label: "Courier delivery", Icon: Truck },
  collection: { label: "Collect in person", Icon: MapPin },
  digital_activation: { label: "Instant digital activation", Icon: Zap },
};

const CHECKOUT_STEPS = ["Plan", "Delivery", "Review"] as const;

function formatMoney(currency: string, amount: number | null | undefined) {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function formatCollectionAddress(address: Record<string, unknown> | null | undefined): string {
  if (!address || typeof address !== "object") return "";
  const parts = ["line1", "line2", "city", "province", "postal_code"]
    .map((k) => address[k])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return parts.join(", ");
}

function ProductImage({ product }: { product: TerminalProduct }) {
  if (product.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image_url}
        alt={product.name}
        className="h-40 w-full rounded-xl object-cover"
      />
    );
  }
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-xl bg-gradient-to-br from-pink-50 via-white to-purple-50 border border-pink-100/60">
      <Smartphone className="h-12 w-12 text-pink-300" />
    </div>
  );
}

function FulfillmentChip({ type }: { type: string | null | undefined }) {
  const meta = FULFILLMENT_META[type ?? ""] ?? null;
  if (!meta) return null;
  const { label, Icon } = meta;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200/80">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function OrderTimeline({ order }: { order: TerminalOrder }) {
  const steps = getTerminalOrderProgressSteps(order);
  return (
    <ol className="mt-3 flex items-center" aria-label="Order progress">
      {steps.map((step, idx) => (
        <li key={step.label} className="flex items-center">
          {idx > 0 ? (
            <span
              className={`mx-1 h-px w-5 sm:w-8 ${
                step.state === "upcoming" ? "bg-gray-200" : "bg-pink-300"
              }`}
              aria-hidden
            />
          ) : null}
          <span className="flex items-center gap-1.5">
            {step.state === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : step.state === "current" ? (
              <span className="flex h-4 w-4 items-center justify-center" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-pink-500 ring-4 ring-pink-100" />
              </span>
            ) : (
              <span className="flex h-4 w-4 items-center justify-center" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-gray-300" />
              </span>
            )}
            <span
              className={`text-[11px] font-medium ${
                step.state === "done"
                  ? "text-green-700"
                  : step.state === "current"
                    ? "text-pink-700"
                    : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function CheckoutStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Checkout steps">
      {CHECKOUT_STEPS.map((label, idx) => {
        const n = (idx + 1) as 1 | 2 | 3;
        const state = n < step ? "done" : n === step ? "current" : "upcoming";
        return (
          <li key={label} className="flex items-center gap-1">
            {idx > 0 ? <span className="mx-1 h-px w-6 bg-gray-200" aria-hidden /> : null}
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                state === "done"
                  ? "bg-green-100 text-green-700"
                  : state === "current"
                    ? "bg-pink-600 text-white"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {state === "done" ? <Check className="h-3 w-3" /> : n}
            </span>
            <span
              className={`text-xs font-medium ${
                state === "current" ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ShopSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-gray-100 p-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function TerminalShopPage() {
  const searchParams = useSearchParams();
  const catalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const ecommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { isOwner } = usePermissions();

  const [products, setProducts] = useState<TerminalProduct[]>([]);
  const [orders, setOrders] = useState<TerminalOrder[]>([]);
  const [assets, setAssets] = useState<TerminalAsset[]>([]);
  const [collectionLocations, setCollectionLocations] = useState<CollectionLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutProduct, setCheckoutProduct] = useState<TerminalProduct | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [commercialModel, setCommercialModel] = useState("once_off_purchase");
  const [collectionLocationId, setCollectionLocationId] = useState("");
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [submitting, setSubmitting] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<"confirmed" | "processing" | null>(null);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  const highlightedOrderId = parseHighlightedOrderId(searchParams);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, ordRes, assetRes, locRes] = await Promise.all([
        catalogEnabled
          ? fetcher.get<{ data: { products: TerminalProduct[] } }>("/api/provider/terminal-products").catch(() => null)
          : Promise.resolve(null),
        ecommerceEnabled
          ? fetcher.get<{ data: { orders: TerminalOrder[] } }>("/api/provider/terminal-orders").catch(() => null)
          : Promise.resolve(null),
        fetcher.get<{ data: { assets: TerminalAsset[] } }>("/api/provider/terminal-assets").catch(() => null),
        ecommerceEnabled
          ? fetcher
              .get<{ data: { locations: CollectionLocation[] } }>("/api/provider/terminal-collection-locations")
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      setProducts(prodRes?.data?.products ?? []);
      setOrders(ordRes?.data?.orders ?? []);
      setAssets(assetRes?.data?.assets ?? []);
      setCollectionLocations(locRes?.data?.locations ?? []);
    } catch {
      toast.error("Failed to load terminal shop");
    } finally {
      setLoading(false);
    }
  }, [catalogEnabled, ecommerceEnabled]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const paymentSuccess = searchParams.get("payment_success");
    const reference = searchParams.get("reference") || searchParams.get("trxref");
    if (paymentSuccess === "1" && reference) {
      void (async () => {
        try {
          await fetcher.get(`/api/paystack/verify-reference?reference=${encodeURIComponent(reference)}`);
          setPaymentBanner("confirmed");
          toast.success("Payment confirmed.");
        } catch {
          setPaymentBanner("processing");
          toast.message("Payment submitted — confirmation may take a moment.");
        }
        void loadAll();
      })();
    } else if (paymentSuccess === "1") {
      setPaymentBanner("confirmed");
      void loadAll();
    }
  }, [searchParams, loadAll]);

  useEffect(() => {
    if (!loading && highlightedOrderId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, highlightedOrderId]);

  const checkoutOptions = useMemo(
    () => checkoutProduct?.checkout_options ?? [],
    [checkoutProduct],
  );

  const selectedOption = checkoutOptions.find((o) => o.commercial_model === commercialModel);
  const fulfillmentType = checkoutProduct?.fulfillment_type ?? "courier";

  const checkoutConfirmState = useMemo(
    () =>
      canConfirmTerminalCheckout({
        selectedOption,
        checkoutOptionsCount: checkoutOptions.length,
        fulfillmentType,
        collectionLocationsCount: collectionLocations.length,
        collectionLocationId,
        addressLine1: deliveryForm.line1,
        city: deliveryForm.city,
        postalCode: deliveryForm.postal_code,
      }),
    [
      selectedOption,
      checkoutOptions.length,
      fulfillmentType,
      collectionLocations.length,
      collectionLocationId,
      deliveryForm.line1,
      deliveryForm.city,
      deliveryForm.postal_code,
    ],
  );

  const pendingActivationOrder = useMemo(
    () =>
      orders.find((o) => {
        if (o.invoice_status !== "paid") return false;
        if (o.integration_setup_status === "awaiting_merchant_onboarding") return true;
        if (o.integration_setup_status !== "pending") return false;
        const vendor = (o.terminal_products?.vendor ?? "").toLowerCase();
        return !vendor || vendor === "paycloud";
      }) ?? null,
    [orders],
  );

  const activeDeviceCount = useMemo(
    () => assets.filter((a) => a.status === "active").length,
    [assets],
  );

  function integrationSetupHref(order: TerminalOrder): string {
    if (order.integration_setup_status === "awaiting_merchant_onboarding") {
      const qs = order.id ? `?order=${encodeURIComponent(order.id)}` : "";
      return `/provider/settings/sales/terminal-merchant-application${qs}`;
    }
    const product = order.terminal_products ?? {};
    const path = resolveIntegrationSetupPath(product);
    return `${path}?order=${encodeURIComponent(order.id)}`;
  }

  function openCheckout(product: TerminalProduct) {
    setCheckoutProduct(product);
    setCheckoutStep(1);
    const first = product.checkout_options?.[0]?.commercial_model ?? "once_off_purchase";
    setCommercialModel(first);
    setCollectionLocationId(collectionLocations[0]?.id ?? "");
    setDeliveryForm(EMPTY_DELIVERY);
  }

  function buildFulfillmentPayload() {
    if (fulfillmentType === "collection") {
      return { collection_location_id: collectionLocationId || null, delivery_address: null };
    }
    if (fulfillmentType === "digital_activation") {
      return { collection_location_id: null, delivery_address: null };
    }
    return {
      collection_location_id: null,
      delivery_address: {
        line1: deliveryForm.line1.trim(),
        line2: deliveryForm.line2.trim() || undefined,
        city: deliveryForm.city.trim(),
        province: deliveryForm.province.trim() || undefined,
        postal_code: deliveryForm.postal_code.trim(),
        contact_name: deliveryForm.contact_name.trim() || undefined,
        contact_phone: deliveryForm.contact_phone.trim() || undefined,
        country: "ZA",
      },
    };
  }

  function validateFulfillmentStep(): string | null {
    if (fulfillmentType === "collection" && collectionLocations.length === 0) {
      return "No pickup locations are configured yet. Contact support.";
    }
    const payload = buildFulfillmentPayload();
    try {
      validateTerminalOrderFulfillment({
        fulfillment_type: fulfillmentType as TerminalFulfillmentType,
        delivery_address: payload.delivery_address,
        collection_location_id: payload.collection_location_id,
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid fulfillment details";
    }
  }

  function advanceCheckoutStep() {
    if (checkoutStep === 2) {
      const err = validateFulfillmentStep();
      if (err) {
        toast.error(err);
        return;
      }
    }
    setCheckoutStep((s) => (s + 1) as 1 | 2 | 3);
  }

  async function placeOrder() {
    if (!checkoutProduct || !selectedOption) return;
    setSubmitting(true);
    try {
      const fulfillmentPayload = buildFulfillmentPayload();
      const baseBody = {
        product_id: checkoutProduct.id,
        quantity: 1,
        fulfillment_type: fulfillmentType,
        ...fulfillmentPayload,
      };

      let order: TerminalOrder | undefined;
      let requiresPayment = selectedOption.requires_payment;

      if (commercialModel === "subscription_bundle") {
        const res = await fetcher.post<{ data: { order: TerminalOrder; requires_payment: boolean } }>(
          "/api/provider/terminal-orders/allocate-from-subscription",
          baseBody,
        );
        order = res.data?.order;
        requiresPayment = false;
        toast.success("Terminal allocated from your subscription plan.");
      } else {
        const res = await fetcher.post<{ data: { order: TerminalOrder; requires_payment: boolean } }>(
          "/api/provider/terminal-orders",
          { ...baseBody, commercial_model: commercialModel },
        );
        order = res.data?.order;
        requiresPayment = res.data?.requires_payment ?? true;
        toast.success(requiresPayment ? "Order placed — complete payment to confirm." : "Order placed.");
      }

      setCheckoutProduct(null);
      await loadAll();

      if (order?.id && requiresPayment) {
        await payForOrder(order.id);
      }
    } catch (err) {
      if (err instanceof FetchError && err.status === 403) {
        toast.error("Only the business owner can place terminal orders");
      } else {
        toast.error(err instanceof FetchError ? err.message : "Failed to place order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function payForOrder(orderId: string) {
    setPayingOrderId(orderId);
    try {
      const res = await fetcher.post<{ data: { payment_url?: string; authorization_url?: string } }>(
        `/api/provider/terminal-orders/${orderId}/initialize-payment`,
        {},
      );
      const url = res.data?.authorization_url ?? res.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("Could not start payment");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Payment failed to start");
    } finally {
      setPayingOrderId(null);
    }
  }

  if (!catalogEnabled && !ecommerceEnabled) {
    return (
      <SettingsDetailLayout
        title="Terminal Shop"
        backHref={
          paycloudEnabled
            ? "/provider/settings/sales/card-machines"
            : "/provider/settings/sales/terminal-integrations"
        }
      >
        <SectionCard>
          <p className="text-sm text-gray-600">Terminal e-commerce is not enabled for your account yet.</p>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  const manageMachinesHref = paycloudEnabled
    ? "/provider/settings/sales/card-machines"
    : "/provider/settings/sales/terminal-integrations";

  return (
    <SettingsDetailLayout
      title="Terminal Shop"
      description="Card machines sold and supported by Beautonomi."
      backHref="/provider/settings"
    >
      {loading ? (
        <ShopSkeleton />
      ) : (
        <div className="space-y-8">
          {/* Hero / value strip */}
          <div className="relative overflow-hidden rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-purple-50 p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-pink-700 ring-1 ring-pink-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  Beautonomi card machines
                </div>
                <h2 className="mt-3 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                  Get paid in person — tap, insert, swipe, and QR wallets
                </h2>
                <p className="mt-1.5 text-sm text-gray-600">
                  Order a card machine, activate it with its serial number, and charges flow straight
                  from your bookings and sales checkout.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200/70">
                    <Zap className="h-3.5 w-3.5 text-pink-600" />
                    Charges pushed from checkout
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200/70">
                    <BadgeCheck className="h-3.5 w-3.5 text-pink-600" />
                    Payments auto-reconciled
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200/70">
                    <ShieldCheck className="h-3.5 w-3.5 text-pink-600" />
                    Sold &amp; supported by Beautonomi
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                {activeDeviceCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {activeDeviceCount} device{activeDeviceCount === 1 ? "" : "s"} active
                  </span>
                ) : null}
                <Button asChild variant="outline" size="sm" className="bg-white/80">
                  <Link href={manageMachinesHref}>
                    Manage machines
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Payment return banner */}
          {paymentBanner ? (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
                paymentBanner === "confirmed"
                  ? "border-green-200 bg-green-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2
                  className={`mt-0.5 h-5 w-5 ${
                    paymentBanner === "confirmed" ? "text-green-600" : "text-amber-600"
                  }`}
                />
                <div>
                  <p
                    className={`text-sm font-medium ${
                      paymentBanner === "confirmed" ? "text-green-900" : "text-amber-900"
                    }`}
                  >
                    {paymentBanner === "confirmed"
                      ? "Payment confirmed"
                      : "Payment submitted — confirmation may take a moment"}
                  </p>
                  <p
                    className={`text-xs ${
                      paymentBanner === "confirmed" ? "text-green-700" : "text-amber-700"
                    }`}
                  >
                    {paymentBanner === "confirmed"
                      ? "Next step: activate your machine with its serial number."
                      : "Check Your orders below — the status updates automatically."}
                  </p>
                </div>
              </div>
              {paymentBanner === "confirmed" && pendingActivationOrder && paycloudEnabled ? (
                <Button asChild size="sm">
                  <Link href={integrationSetupHref(pendingActivationOrder)}>
                    {pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                      ? "Complete application"
                      : "Activate machine"}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Pending activation nudge */}
          {!paymentBanner && pendingActivationOrder && paycloudEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50/60 p-4">
              <div className="flex items-start gap-2.5">
                <Package className="mt-0.5 h-5 w-5 text-pink-600" />
                <div>
                  <p className="text-sm font-medium text-pink-900">
                    {pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                      ? "Complete your card machine application"
                      : `${pendingActivationOrder.terminal_products?.name ?? "Your card machine"} is paid and waiting for activation`}
                  </p>
                  <p className="text-xs text-pink-700">
                    {pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                      ? "We need a few business details before we can ship your device."
                      : "Enter the serial number from the device label to finish setup."}
                  </p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={integrationSetupHref(pendingActivationOrder)}>
                  {pendingActivationOrder.integration_setup_status === "awaiting_merchant_onboarding"
                    ? "Complete application"
                    : "Activate machine"}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : null}

          {/* Catalog */}
          {catalogEnabled && (
            <SectionCard
              title="Choose your machine"
              description="Every machine works with Beautonomi checkout out of the box."
            >
              {products.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center">
                  <Smartphone className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">No terminal products available yet — check back soon.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {products.map((p) => {
                    const cta = resolveTerminalShopOrderCta({
                      ecommerceEnabled,
                      stockStatus: p.stock_status,
                      checkoutOptionsCount: (p.checkout_options ?? []).length,
                      isOwner: isOwner ? true : isOwner === false ? false : undefined,
                    });
                    const options = p.checkout_options ?? [];
                    const includedOption = options.find((o) => !o.requires_payment);
                    const outOfStock = p.stock_status === "out_of_stock";
                    return (
                      <div
                        key={p.id}
                        className={`flex flex-col gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-md ${
                          outOfStock ? "border-gray-100 opacity-75" : "border-gray-100"
                        }`}
                      >
                        <div className="relative">
                          <ProductImage product={p} />
                          {includedOption ? (
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-pink-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                              <Sparkles className="h-3 w-3" />
                              Included in your plan
                            </span>
                          ) : null}
                          {p.stock_status !== "in_stock" ? (
                            <Badge
                              variant="outline"
                              className="absolute right-2 top-2 bg-white/90 capitalize text-xs"
                            >
                              {p.stock_status.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{p.name}</h3>
                          <p className="text-xs text-gray-500 capitalize">
                            {p.vendor}
                            {p.model ? ` · ${p.model}` : ""}
                          </p>
                        </div>
                        {p.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{p.description}</p>
                        )}
                        <FulfillmentChip type={p.fulfillment_type} />
                        {options.length > 0 ? (
                          <div className="grid gap-1.5">
                            {options.map((opt) => (
                              <div
                                key={opt.commercial_model}
                                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ${
                                  !opt.requires_payment
                                    ? "bg-pink-50/60 ring-pink-200 text-pink-900"
                                    : "bg-gray-50 ring-gray-200/70 text-gray-700"
                                }`}
                              >
                                <span className="font-medium">{opt.label}</span>
                                <span className="font-semibold">
                                  {opt.requires_payment
                                    ? formatMoney(opt.currency, opt.price)
                                    : "R 0 — in plan"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-auto space-y-1.5 pt-1">
                          {cta.kind === "order" ? (
                            <Button className="w-full" onClick={() => openCheckout(p)}>
                              Order this machine
                              <ArrowRight className="ml-1.5 h-4 w-4" />
                            </Button>
                          ) : (
                            <>
                              <Button className="w-full" disabled>
                                {cta.kind === "out_of_stock" ? "Out of stock" : "Order this machine"}
                              </Button>
                              {cta.kind !== "out_of_stock" ? (
                                <p className="text-center text-xs text-gray-500">{cta.message}</p>
                              ) : null}
                            </>
                          )}
                          <p className="text-center text-[11px] text-gray-400">
                            Sold and supported by Beautonomi
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          )}

          {/* Orders */}
          {ecommerceEnabled && (
            <SectionCard title="Your orders" description="Track payment, integration, and delivery.">
              {orders.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    No orders yet — pick a machine above to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => {
                    const primaryAction = resolveTerminalOrderPrimaryAction(o);
                    const isHighlighted = highlightedOrderId === o.id;
                    return (
                      <div
                        key={o.id}
                        ref={isHighlighted ? highlightedRef : undefined}
                        className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 ${
                          isHighlighted ? "border-pink-300 bg-pink-50/40 ring-1 ring-pink-200" : "border-gray-100"
                        }`}
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium text-gray-900">
                            {o.terminal_products?.name ?? "Terminal order"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(o.created_at).toLocaleDateString()} ·{" "}
                            {TERMINAL_COMMERCIAL_MODEL_LABELS[o.commercial_model as TerminalCommercialModel] ??
                              o.commercial_model.replace(/_/g, " ")}{" "}
                            · {o.currency} {Number(o.total_amount).toLocaleString()}
                          </p>
                          <OrderTimeline order={o} />
                          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-gray-500">
                            {o.fulfillment_type ? (
                              <span className="capitalize">
                                {FULFILLMENT_META[o.fulfillment_type]?.label ??
                                  o.fulfillment_type.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {o.tracking_reference ? (
                              <span>
                                {o.courier_name ? `${o.courier_name}: ` : "Tracking: "}
                                <span className="font-mono">{o.tracking_reference}</span>
                              </span>
                            ) : null}
                            {o.fulfillment_type === "collection" && o.terminal_collection_locations?.name ? (
                              <span>Pickup: {o.terminal_collection_locations.name}</span>
                            ) : null}
                            {["cancelled", "refunded", "failed"].includes(o.order_status) ? (
                              <Badge variant="outline" className="text-xs capitalize">
                                {o.order_status.replace(/_/g, " ")}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 sm:items-end">
                          {primaryAction === "pay" ? (
                            <Button size="sm" disabled={payingOrderId === o.id} onClick={() => payForOrder(o.id)}>
                              <CreditCard className="mr-1.5 h-4 w-4" />
                              {payingOrderId === o.id ? "Starting…" : "Pay now"}
                            </Button>
                          ) : null}
                          {primaryAction === "setup" ? (
                            <Button size="sm" asChild>
                              <Link href={integrationSetupHref(o)}>
                                <Wrench className="mr-1.5 h-4 w-4" />
                                {o.integration_setup_status === "awaiting_merchant_onboarding"
                                  ? "Complete application"
                                  : "Complete setup"}
                              </Link>
                            </Button>
                          ) : null}
                          {o.invoice_status === "paid" ? (
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={`/api/provider/terminal-orders/${o.id}/receipt/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="mr-1.5 h-4 w-4" />
                                Receipt
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          )}

          {/* Devices */}
          {assets.length > 0 && (
            <SectionCard title="Your devices" description="Machines linked to your account.">
              <div className="space-y-2">
                {assets.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50">
                        <Smartphone className="h-5 w-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {a.terminal_products?.name ?? "Terminal device"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {TERMINAL_ASSET_OWNERSHIP_LABELS[a.ownership_model] ??
                            a.ownership_model.replace(/_/g, " ")}
                          {a.serial_number ? (
                            <>
                              {" · Serial "}
                              <span className="font-mono">{a.serial_number}</span>
                            </>
                          ) : (
                            <>
                              {" · "}
                              Serial not assigned yet — card payments stay unavailable until
                              Beautonomi registers this machine
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`capitalize ${a.status === "active" ? "border-green-200 bg-green-50 text-green-700" : ""}`}
                    >
                      {a.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* What happens after purchase */}
          <SectionCard className="border-dashed bg-slate-50">
            <h3 className="font-semibold text-gray-900">What happens after purchase</h3>
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              <li className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                  1
                </span>
                <p className="text-sm text-gray-600">
                  Pay for your order — we prepare it for delivery, pickup, or instant activation.
                </p>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                  2
                </span>
                <p className="text-sm text-gray-600">
                  Activate the machine with its serial number in{" "}
                  <Link href={manageMachinesHref} className="font-medium text-pink-600 underline">
                    {paycloudEnabled ? "Card machines" : "Terminal Integrations"}
                  </Link>
                  .
                </p>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">
                  3
                </span>
                <p className="text-sm text-gray-600">
                  Turn on in-person acceptance and start charging at bookings and sales.
                </p>
              </li>
            </ol>
          </SectionCard>
        </div>
      )}

      {/* Checkout sheet */}
      <Sheet
        open={!!checkoutProduct}
        onOpenChange={(open) => {
          if (!open && !submitting) setCheckoutProduct(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          {checkoutProduct ? (
            <>
              <div className="border-b px-6 pb-4 pt-6">
                <SheetHeader>
                  <SheetTitle>Order {checkoutProduct.name}</SheetTitle>
                  <SheetDescription className="capitalize">
                    {checkoutProduct.vendor}
                    {checkoutProduct.model ? ` · ${checkoutProduct.model}` : ""}
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4">
                  <CheckoutStepper step={checkoutStep} />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {checkoutStep === 1 && (
                  <div className="space-y-2.5">
                    <p className="text-sm font-medium text-gray-900">How would you like to get it?</p>
                    {checkoutOptions.length === 0 ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        This product isn&apos;t configured for checkout. Contact Beautonomi support.
                      </p>
                    ) : (
                      checkoutOptions.map((opt) => {
                        const selected = commercialModel === opt.commercial_model;
                        return (
                          <label
                            key={opt.commercial_model}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                              selected
                                ? "border-pink-400 bg-pink-50/50 ring-1 ring-pink-300"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="commercial_model"
                              value={opt.commercial_model}
                              checked={selected}
                              onChange={() => setCommercialModel(opt.commercial_model)}
                              className="sr-only"
                            />
                            <span
                              className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                                selected ? "border-pink-600" : "border-gray-300"
                              }`}
                              aria-hidden
                            >
                              {selected ? <span className="h-2 w-2 rounded-full bg-pink-600" /> : null}
                            </span>
                            <span className="flex-1 text-sm">
                              <span className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-900">{opt.label}</span>
                                <span className={`font-semibold ${opt.requires_payment ? "text-gray-900" : "text-pink-700"}`}>
                                  {opt.requires_payment
                                    ? formatMoney(opt.currency, opt.price)
                                    : "R 0 — in your plan"}
                                </span>
                              </span>
                              {opt.description && (
                                <span className="mt-1 block text-xs text-gray-500">{opt.description}</span>
                              )}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}

                {checkoutStep === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <FulfillmentChip type={fulfillmentType} />
                    </div>
                    {fulfillmentType === "collection" && (
                      <div className="space-y-2">
                        <Label>Pickup location</Label>
                        {collectionLocations.length === 0 ? (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            No pickup locations are configured yet. Contact support.
                          </p>
                        ) : (
                          collectionLocations.map((loc) => {
                            const selected = collectionLocationId === loc.id;
                            const address = formatCollectionAddress(loc.address);
                            return (
                              <button
                                key={loc.id}
                                type="button"
                                onClick={() => setCollectionLocationId(loc.id)}
                                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                                  selected
                                    ? "border-pink-400 bg-pink-50/50 ring-1 ring-pink-300"
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                              >
                                <MapPin className={`mt-0.5 h-4 w-4 ${selected ? "text-pink-600" : "text-gray-400"}`} />
                                <span>
                                  <span className="block text-sm font-medium text-gray-900">{loc.name}</span>
                                  {address ? (
                                    <span className="mt-0.5 block text-xs text-gray-500">{address}</span>
                                  ) : null}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                    {(fulfillmentType === "shipping" || fulfillmentType === "courier") && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["line1", "Address line 1", "address-line1"],
                            ["line2", "Address line 2", "address-line2"],
                            ["city", "City", "address-level2"],
                            ["province", "Province", "address-level1"],
                            ["postal_code", "Postal code", "postal-code"],
                            ["contact_name", "Contact name", "name"],
                            ["contact_phone", "Contact phone", "tel"],
                          ] as const
                        ).map(([key, label, autoComplete]) => (
                          <div key={key} className={key === "line1" || key === "line2" ? "sm:col-span-2" : ""}>
                            <Label>{label}</Label>
                            <Input
                              className="mt-1"
                              autoComplete={autoComplete}
                              value={deliveryForm[key]}
                              onChange={(e) => setDeliveryForm((f) => ({ ...f, [key]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {fulfillmentType === "digital_activation" && (
                      <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 p-4">
                        <Zap className="mt-0.5 h-4 w-4 text-pink-600" />
                        <p className="text-sm text-gray-600">
                          This product activates digitally — nothing gets shipped. You&apos;ll be prompted
                          to complete brand integration after confirmation.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {checkoutStep === 3 && selectedOption && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                        {checkoutProduct.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={checkoutProduct.image_url}
                            alt={checkoutProduct.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
                            <Smartphone className="h-6 w-6 text-pink-300" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{checkoutProduct.name}</p>
                        <p className="text-xs text-gray-500">{selectedOption.label}</p>
                        <FulfillmentChip type={fulfillmentType} />
                      </div>
                    </div>
                    <dl className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Plan</dt>
                        <dd className="font-medium text-gray-900">{selectedOption.label}</dd>
                      </div>
                      {fulfillmentType === "collection" ? (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Pickup</dt>
                          <dd className="font-medium text-gray-900">
                            {collectionLocations.find((l) => l.id === collectionLocationId)?.name ?? "—"}
                          </dd>
                        </div>
                      ) : null}
                      {(fulfillmentType === "shipping" || fulfillmentType === "courier") &&
                      deliveryForm.line1 ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500">Deliver to</dt>
                          <dd className="text-right font-medium text-gray-900">
                            {[deliveryForm.line1, deliveryForm.city, deliveryForm.postal_code]
                              .filter(Boolean)
                              .join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between border-t border-gray-200 pt-2">
                        <dt className="font-medium text-gray-900">Total today</dt>
                        <dd className="text-base font-bold text-gray-900">
                          {selectedOption.requires_payment
                            ? formatMoney(selectedOption.currency, selectedOption.price)
                            : "R 0 — included in subscription"}
                        </dd>
                      </div>
                    </dl>
                    {checkoutProduct.requires_integration_setup && (
                      <p className="flex items-start gap-2 text-xs text-gray-500">
                        <Wrench className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        Brand integration setup will be required after confirmation.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t bg-gray-50/70 px-6 py-4">
                {selectedOption ? (
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total today</span>
                    <span className="font-semibold text-gray-900">
                      {selectedOption.requires_payment
                        ? formatMoney(selectedOption.currency, selectedOption.price)
                        : "R 0 — in your plan"}
                    </span>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  {checkoutStep > 1 ? (
                    <Button
                      variant="outline"
                      className="flex-none"
                      onClick={() => setCheckoutStep((s) => (s - 1) as 1 | 2 | 3)}
                      disabled={submitting}
                    >
                      Back
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="flex-none"
                      onClick={() => setCheckoutProduct(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  )}
                  {checkoutStep < 3 ? (
                    <Button
                      className="flex-1"
                      onClick={advanceCheckoutStep}
                      disabled={
                        (checkoutStep === 1 && !selectedOption) ||
                        (checkoutStep === 1 && checkoutOptions.length === 0)
                      }
                    >
                      Continue
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      className="flex-1"
                      onClick={() => void placeOrder()}
                      disabled={submitting || !checkoutConfirmState.ok}
                      title={checkoutConfirmState.message}
                    >
                      {submitting
                        ? "Placing…"
                        : selectedOption?.requires_payment
                          ? "Place order & pay"
                          : "Confirm allocation"}
                    </Button>
                  )}
                </div>
                {checkoutStep === 3 && !checkoutConfirmState.ok && checkoutConfirmState.message ? (
                  <p className="mt-2 text-xs text-amber-700">{checkoutConfirmState.message}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </SettingsDetailLayout>
  );
}

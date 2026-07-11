"use client";

/**
 * /provider/settings/sales/terminal-shop
 * Browse platform terminal catalog, place orders, pay via Paystack, view assets.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreditCard, Download, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function formatMoney(currency: string, amount: number | null | undefined) {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

type OrderProgressStep = { label: string; state: "done" | "current" | "upcoming" };

function getOrderProgressSteps(order: TerminalOrder): OrderProgressStep[] {
  const paid = order.invoice_status === "paid";
  const setupRequired =
    order.integration_setup_status != null && order.integration_setup_status !== "not_required";
  const setupDone = !setupRequired || order.integration_setup_status === "completed";
  const complete =
    order.order_status === "delivered" ||
    order.fulfillment_status === "delivered" ||
    (order.fulfillment_type === "digital_activation" && paid && setupDone);

  const fulfillmentLabel =
    order.fulfillment_type === "collection"
      ? "Ready for pickup"
      : order.fulfillment_type === "digital_activation"
        ? "Activated"
        : "Delivered";

  const steps: Array<{ label: string; reached: boolean; active: boolean }> = [
    { label: "Placed", reached: true, active: !paid },
    { label: "Paid", reached: paid, active: paid && !complete && (!setupRequired || setupDone) },
  ];

  if (setupRequired) {
    steps.push({
      label: "Integration",
      reached: setupDone,
      active: paid && !setupDone,
    });
  }

  steps.push({
    label: fulfillmentLabel,
    reached: complete,
    active: paid && setupDone && !complete,
  });

  let foundCurrent = false;
  return steps.map((step) => {
    if (step.active && !foundCurrent) {
      foundCurrent = true;
      return { label: step.label, state: "current" };
    }
    if (step.reached && !step.active) {
      return { label: step.label, state: "done" };
    }
    if (step.reached && step.active) {
      foundCurrent = true;
      return { label: step.label, state: "current" };
    }
    return { label: step.label, state: "upcoming" };
  });
}

function OrderProgress({ order }: { order: TerminalOrder }) {
  const steps = getOrderProgressSteps(order);
  return (
    <ol className="mt-2 flex flex-wrap gap-2">
      {steps.map((step) => (
        <li
          key={step.label}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            step.state === "done"
              ? "bg-green-50 text-green-700"
              : step.state === "current"
                ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200"
                : "bg-gray-50 text-gray-400"
          }`}
        >
          {step.label}
        </li>
      ))}
    </ol>
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
          toast.success("Payment confirmed.");
        } catch {
          toast.message("Payment submitted — confirmation may take a moment.");
        }
        void loadAll();
      })();
    } else if (paymentSuccess === "1") {
      void loadAll();
    }
  }, [searchParams, loadAll]);

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

  function integrationSetupHref(order: TerminalOrder): string {
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

  return (
    <SettingsDetailLayout
      title="Terminal Shop"
      description="Order card machines and payment terminals from the Beautonomi catalog."
      backHref="/provider/settings"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading…
        </div>
      ) : (
        <div className="space-y-8">
          {catalogEnabled && (
            <SectionCard title="Catalog">
              {products.length === 0 ? (
                <p className="text-sm text-gray-500">No terminal products available yet.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {products.map((p) => (
                    <div key={p.id} className="rounded-xl border border-gray-100 p-4 space-y-3">
                      {p.image_url && (
                        <img src={p.image_url} alt={p.name} className="h-32 w-full rounded-lg object-cover" />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{p.name}</h3>
                          <p className="text-xs text-gray-500 capitalize">
                            {p.vendor}{p.model ? ` · ${p.model}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize text-xs">
                          {p.stock_status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      {p.description && <p className="text-sm text-gray-600 line-clamp-2">{p.description}</p>}
                      {p.fulfillment_type && (
                        <p className="text-xs text-gray-500 capitalize">
                          Fulfillment: {p.fulfillment_type.replace(/_/g, " ")}
                        </p>
                      )}
                      <div className="text-sm space-y-1">
                        {(p.checkout_options ?? []).map((opt) => (
                          <p key={opt.commercial_model}>
                            {opt.label}:{" "}
                            <strong>
                              {opt.requires_payment
                                ? formatMoney(opt.currency, opt.price)
                                : "Included in plan"}
                            </strong>
                          </p>
                        ))}
                      </div>
                      {(() => {
                        const cta = resolveTerminalShopOrderCta({
                          ecommerceEnabled,
                          stockStatus: p.stock_status,
                          checkoutOptionsCount: (p.checkout_options ?? []).length,
                          isOwner: isOwner ? true : isOwner === false ? false : undefined,
                        });
                        if (cta.kind === "order") {
                          return (
                            <Button size="sm" onClick={() => openCheckout(p)}>
                              Order
                            </Button>
                          );
                        }
                        return (
                          <div className="space-y-1">
                            <Button size="sm" disabled>
                              Order
                            </Button>
                            <p className="text-xs text-gray-500">{cta.message}</p>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {ecommerceEnabled && (
            <SectionCard title="Your orders">
              {orders.length === 0 ? (
                <p className="text-sm text-gray-500">No orders yet.</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                        highlightedOrderId === o.id ? "border-pink-300 bg-pink-50/40" : "border-gray-100"
                      }`}
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">{o.terminal_products?.name ?? "Terminal order"}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(o.created_at).toLocaleDateString()} ·{" "}
                          {TERMINAL_COMMERCIAL_MODEL_LABELS[o.commercial_model as TerminalCommercialModel] ??
                            o.commercial_model.replace(/_/g, " ")}{" "}
                          · {o.currency} {Number(o.total_amount).toLocaleString()}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs capitalize">{o.order_status.replace(/_/g, " ")}</Badge>
                          <Badge variant="outline" className="text-xs capitalize">{o.invoice_status.replace(/_/g, " ")}</Badge>
                          {o.fulfillment_type && (
                            <Badge variant="outline" className="text-xs capitalize">{o.fulfillment_type.replace(/_/g, " ")}</Badge>
                          )}
                          {o.fulfillment_status && (
                            <Badge variant="outline" className="text-xs capitalize">{o.fulfillment_status.replace(/_/g, " ")}</Badge>
                          )}
                        </div>
                        {o.tracking_reference && (
                          <p className="text-xs text-gray-500">
                            {o.courier_name ? `${o.courier_name}: ` : ""}{o.tracking_reference}
                          </p>
                        )}
                        {o.fulfillment_type === "collection" && o.terminal_collection_locations?.name && (
                          <p className="text-xs text-gray-500">
                            Pickup: {o.terminal_collection_locations.name}
                          </p>
                        )}
                        <OrderProgress order={o} />
                        {o.integration_setup_status === "pending" && (
                          <Link href={integrationSetupHref(o)} className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 underline">
                            <Wrench className="h-3 w-3" />
                            Complete brand integration setup
                          </Link>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {o.invoice_status !== "paid" && !["cancelled", "refunded"].includes(o.order_status) && o.commercial_model !== "subscription_bundle" && (
                          <Button size="sm" disabled={payingOrderId === o.id} onClick={() => payForOrder(o.id)}>
                            {payingOrderId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                            Pay now
                          </Button>
                        )}
                        {o.invoice_status === "paid" && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={`/api/provider/terminal-orders/${o.id}/receipt/pdf`} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                              Receipt
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {assets.length > 0 && (
            <SectionCard title="Your devices">
              <div className="space-y-2">
                {assets.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div>
                      <p>{a.terminal_products?.name ?? "Terminal device"}</p>
                      {a.ownership_model && (
                        <p className="text-xs text-gray-500">
                          {TERMINAL_ASSET_OWNERSHIP_LABELS[a.ownership_model] ??
                            a.ownership_model.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="capitalize">{a.status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <p className="text-xs text-gray-500">
            After purchase, complete setup in{" "}
            {paycloudEnabled ? (
              <Link href="/provider/settings/sales/card-machines" className="underline">
                Card machines
              </Link>
            ) : (
              <Link href="/provider/settings/sales/terminal-integrations" className="underline">
                Terminal Integrations
              </Link>
            )}
            .
          </p>
        </div>
      )}

      {checkoutProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">Order {checkoutProduct.name}</h3>
            <p className="mt-1 text-sm text-gray-500">Step {checkoutStep} of 3</p>

            {checkoutStep === 1 && (
              <div className="mt-4 space-y-2">
                {checkoutOptions.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    This product isn&apos;t configured for checkout. Contact Beautonomi support.
                  </p>
                ) : (
                  checkoutOptions.map((opt) => (
                    <label key={opt.commercial_model} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                      <input
                        type="radio"
                        name="commercial_model"
                        value={opt.commercial_model}
                        checked={commercialModel === opt.commercial_model}
                        onChange={() => setCommercialModel(opt.commercial_model)}
                        className="mt-1"
                      />
                      <span className="flex-1 text-sm">
                        <span className="font-medium">{opt.label}</span>
                        <span className="block text-gray-500">
                          {opt.requires_payment ? formatMoney(opt.currency, opt.price) : "No payment required"}
                        </span>
                        {opt.description && <span className="block text-xs text-gray-400 mt-1">{opt.description}</span>}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}

            {checkoutStep === 2 && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600 capitalize">
                  Fulfillment: {fulfillmentType.replace(/_/g, " ")}
                </p>
                {fulfillmentType === "collection" && (
                  <div>
                    <Label>Pickup location</Label>
                    <select
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      value={collectionLocationId}
                      onChange={(e) => setCollectionLocationId(e.target.value)}
                    >
                      {collectionLocations.length === 0 ? (
                        <option value="">No pickup locations configured</option>
                      ) : (
                        collectionLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))
                      )}
                    </select>
                  </div>
                )}
                {(fulfillmentType === "shipping" || fulfillmentType === "courier") && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["line1", "Address line 1"],
                        ["line2", "Address line 2"],
                        ["city", "City"],
                        ["province", "Province"],
                        ["postal_code", "Postal code"],
                        ["contact_name", "Contact name"],
                        ["contact_phone", "Contact phone"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className={key === "line1" || key === "line2" ? "sm:col-span-2" : ""}>
                        <Label>{label}</Label>
                        <Input
                          className="mt-1"
                          value={deliveryForm[key]}
                          onChange={(e) => setDeliveryForm((f) => ({ ...f, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {fulfillmentType === "digital_activation" && (
                  <p className="text-sm text-gray-600">
                    This product activates digitally. You will be prompted to complete brand integration after confirmation.
                  </p>
                )}
              </div>
            )}

            {checkoutStep === 3 && selectedOption && (
              <div className="mt-4 space-y-2 text-sm">
                <p><strong>Model:</strong> {selectedOption.label}</p>
                <p>
                  <strong>Total:</strong>{" "}
                  {selectedOption.requires_payment
                    ? formatMoney(selectedOption.currency, selectedOption.price)
                    : "Included in subscription"}
                </p>
                {checkoutProduct.requires_integration_setup && (
                  <p className="text-gray-600">Brand integration setup will be required after confirmation.</p>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCheckoutProduct(null)} disabled={submitting}>
                Cancel
              </Button>
              {checkoutStep > 1 && (
                <Button variant="outline" onClick={() => setCheckoutStep((s) => (s - 1) as 1 | 2 | 3)} disabled={submitting}>
                  Back
                </Button>
              )}
              {checkoutStep < 3 ? (
                <Button
                  onClick={advanceCheckoutStep}
                  disabled={
                    (checkoutStep === 1 && !selectedOption) ||
                    (checkoutStep === 1 && checkoutOptions.length === 0)
                  }
                >
                  Continue
                </Button>
              ) : (
                <Button
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
        </div>
      )}
    </SettingsDetailLayout>
  );
}

"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FetchError, fetcher, isTransientNetworkFetchError } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import {
  Store,
  Truck,
  Loader2,
  ShoppingBag,
  ChevronLeft,
  AlertCircle,
  CreditCard,
  CheckCircle,
  Plus,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface CartItem {
  id: string;
  quantity: number;
  effective_price?: number;
  in_stock?: boolean;
  product_variant?: { option_values?: Record<string, string>; quantity?: number } | null;
  product: {
    id: string;
    name: string;
    retail_price: number;
    image_urls: string[];
    tax_rate?: string | number | null;
    quantity?: number;
    is_active?: boolean;
  };
}

interface Address {
  id: string;
  label: string | null;
  address_line1: string;
  city: string;
  postal_code: string | null;
  is_default: boolean;
}

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
}

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  estimated_delivery_days: number;
}

interface SavedCard {
  id: string;
  card_type?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  expiry_label?: string;
  is_expired?: boolean;
  is_default: boolean;
  is_active: boolean;
}

export default function ProductCheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const providerId = searchParams.get("provider_id");

  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [requiresProviderSelection, setRequiresProviderSelection] = useState(false);

  const [fulfillment, setFulfillment] = useState<"collection" | "delivery">("collection");
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"paystack" | "card_on_delivery">("paystack");
  const [useWallet, setUseWallet] = useState(false);
  const [promotionCode, setPromotionCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);
  const [platformFeeConfig, setPlatformFeeConfig] = useState({
    type: "fixed",
    percentage: 0,
    fixed: 0,
    show: false,
  });
  const [cashEnabledOnPlatform, setCashEnabledOnPlatform] = useState(false);
  const { enabled: paystackEnabled } = useFeatureFlag("payment_paystack");
  const { enabled: walletEnabled } = useFeatureFlag("payment_wallet");
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;

  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(true);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setSavedCards([]);
        setSelectedCardId(null);
        setCardsLoading(false);
        setUseNewCard(true);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    setCardsLoading(true);
    (async () => {
      try {
        const res = await fetcher.get<{ data: SavedCard[] }>("/api/me/payment-methods");
        if (cancelled) return;
        const active = (res?.data ?? []).filter((c) => c.is_active && !c.is_expired);
        setSavedCards(active);
        if (active.length === 0) {
          setUseNewCard(true);
          setSelectedCardId(null);
        } else {
          setSelectedCardId((prev) => {
            if (prev && active.some((c) => c.id === prev)) return prev;
            return (active.find((c) => c.is_default) ?? active[0])?.id ?? null;
          });
          setUseNewCard(false);
        }
      } catch {
        if (!cancelled) {
          setSavedCards([]);
          setUseNewCard(true);
        }
      } finally {
        if (!cancelled) setCardsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSetDefaultCard = async (cardId: string) => {
    setSettingDefaultId(cardId);
    try {
      await fetcher.patch(`/api/me/payment-methods/${cardId}`, { is_default: true });
      const listRes = await fetcher.get<{ data: SavedCard[] }>("/api/me/payment-methods");
      const active = (listRes.data || []).filter((c) => c.is_active && !c.is_expired);
      setSavedCards(active);
      toast.success("Default card updated");
    } catch {
      toast.error("Failed to set default card");
    } finally {
      setSettingDefaultId(null);
    }
  };

  // Inline removal during shop checkout — confirm to avoid a slip in the
  // dense list, then optimistically prune and re-select the next usable card
  // (or fall back to entering a new card) so the customer keeps flowing.
  const handleRemoveSavedCard = async (cardId: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Remove this card from your saved cards? You can always re-add it during your next payment."
      );
      if (!ok) return;
    }
    setRemovingCardId(cardId);
    try {
      await fetcher.delete(`/api/me/payment-methods/${cardId}`);
      const next = savedCards.filter((c) => c.id !== cardId);
      setSavedCards(next);
      if (selectedCardId === cardId) {
        const fallback = next.find((c) => c.is_default) ?? next[0] ?? null;
        if (fallback) {
          setSelectedCardId(fallback.id);
          setUseNewCard(false);
        } else {
          setSelectedCardId(null);
          setUseNewCard(true);
        }
      }
      toast.success("Card removed");
    } catch {
      toast.error("Failed to remove card");
    } finally {
      setRemovingCardId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setPageError(null);

        // Fetch cart first; this lets us recover when provider_id is missing.
        const cartRes = await fetcher.get<{ data: { items: CartItem[] } }>("/api/me/cart");
        const allItems = cartRes?.data?.items ?? [];
        const providerIds = Array.from(
          new Set(
            allItems
              .map((item: any) => item.provider?.id ?? item.product?.provider_id ?? null)
              .filter((id: string | null): id is string => Boolean(id))
          )
        );
        const effectiveProviderId =
          providerId ?? (providerIds.length === 1 ? providerIds[0] : null);

        if (!effectiveProviderId) {
          if (!cancelled) {
            setItems([]);
            setRequiresProviderSelection(!providerId && providerIds.length > 1);
          }
          return;
        }
        if (!cancelled) setRequiresProviderSelection(false);

        if (!providerId) {
          router.replace(`/shop/checkout?provider_id=${encodeURIComponent(effectiveProviderId)}`);
        }

        const providerItems = allItems.filter(
          (item: any) => (item.provider?.id ?? item.product?.provider_id) === effectiveProviderId
        );
        if (!cancelled) setItems(providerItems);

        const addrRes = await fetcher.get<{ data: { addresses: Address[] } | Address[] }>(
          "/api/me/addresses"
        );
        const addrData = addrRes?.data;
        const addrList = Array.isArray(addrData) ? addrData : ((addrData as any)?.addresses ?? []);
        if (!cancelled) {
          setAddresses(addrList);
          const def = addrList.find((a: Address) => a.is_default);
          if (def) setSelectedAddress(def.id);
        }

        const locRes = await fetcher.get<{ data: { locations: Location[] } | Location[] }>(
          `/api/public/provider-locations?provider_id=${effectiveProviderId}`
        );
        const locData = locRes?.data;
        const locList = Array.isArray(locData) ? locData : ((locData as any)?.locations ?? []);
        if (!cancelled) {
          setLocations(locList);
          if (locList.length > 0) setSelectedLocation(locList[0].id);
        }

        const shipRes = await fetcher.get<{ data: any }>(
          `/api/public/products/shipping-config?provider_id=${effectiveProviderId}`
        );
        if (!cancelled && shipRes?.data) {
          const sc = shipRes.data?.shipping ?? shipRes.data?.config ?? shipRes.data;
          setShippingConfig(sc);
          if (!sc.offers_collection && sc.offers_delivery) setFulfillment("delivery");
        }

        const feeUrl = effectiveProviderId
          ? `/api/public/platform-fees?provider_id=${encodeURIComponent(effectiveProviderId)}`
          : "/api/public/platform-fees";
        const feeRes = await fetcher.get<{ data: any }>(feeUrl);
        if (!cancelled && feeRes?.data) {
          setPlatformFeeConfig({
            type: feeRes.data.platform_service_fee_type ?? "fixed",
            percentage: feeRes.data.platform_service_fee_percentage ?? 0,
            fixed: feeRes.data.platform_service_fee_fixed ?? 0,
            show: feeRes.data.show_service_fee_to_customer !== false,
          });
          setCashEnabledOnPlatform(feeRes.data.cash_enabled_on_platform === true);
        }

        if (user) {
          try {
            const walletRes = await fetcher.get<{ data: { wallet: { balance: number } } }>(
              "/api/me/wallet",
              { cache: "no-store" }
            );
            if (!cancelled && walletRes?.data?.wallet) {
              setWalletBalance(Number(walletRes.data.wallet.balance) || 0);
            }
          } catch {
            // ignore wallet fetch issues
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : "Failed to load checkout");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId, user, router]);

  // When Paystack is disabled, default to pay on delivery
  useEffect(() => {
    if (!paystackEnabled && paymentMethod === "paystack") {
      if (cashEnabledOnPlatform) {
        setPaymentMethod("card_on_delivery");
      }
    }
  }, [paystackEnabled, paymentMethod, cashEnabledOnPlatform]);

  useEffect(() => {
    if (!cashEnabledOnPlatform && paymentMethod === "card_on_delivery") {
      setPaymentMethod("paystack");
    }
  }, [cashEnabledOnPlatform, paymentMethod]);

  const linePrice = (i: CartItem) =>
    (i.effective_price ?? i.product?.retail_price ?? 0) * i.quantity;
  const subtotal = items.reduce((s, i) => s + linePrice(i), 0);
  const taxAmount = items.reduce((s, i) => {
    const rate = parseFloat(String(i.product?.tax_rate || "0")) || 0;
    return s + Math.round(((linePrice(i) * rate) / 100) * 100) / 100;
  }, 0);
  const deliveryFee =
    fulfillment === "delivery" && shippingConfig
      ? shippingConfig.free_delivery_threshold && subtotal >= shippingConfig.free_delivery_threshold
        ? 0
        : Number(shippingConfig.delivery_fee) || 0
      : 0;
  const platformFee =
    paymentMethod === "paystack"
      ? platformFeeConfig.type === "fixed"
        ? platformFeeConfig.fixed
        : Math.round(subtotal * platformFeeConfig.percentage) / 100
      : 0;
  const total = subtotal + taxAmount + deliveryFee + platformFee;
  const hasAnyEnabledPaymentMethod = paystackEnabled || cashEnabledOnPlatform;

  const hasOutOfStock = items.some((i) => i.in_stock === false);

  const createWebOrderIdempotencyKey = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const pollWebProductOrderPaid = async (orderId: string, attempts = 8) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetcher.get<{ data?: { order?: { payment_status?: string } } }>(
          `/api/me/orders/${orderId}`,
          { staleTimeMs: 0 },
        );
        if (String(res?.data?.order?.payment_status ?? "").toLowerCase() === "paid") {
          return true;
        }
      } catch {
        // Keep polling — webhook/reconcile may still be writing.
      }
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    return false;
  };

  const recoverRecentWebOrder = async (
    forProviderId: string,
  ): Promise<{ id: string; order_number: string; paid_with_wallet?: boolean; amount_due?: number } | null> => {
    try {
      const listRes = await fetcher.get<{ data?: { orders?: Array<{ id: string; order_number: string; provider?: { id?: string }; created_at: string; payment_status?: string; status?: string; wallet_amount?: number | null }> } }>(
        "/api/me/orders?limit=10",
      );
      const orders = listRes?.data?.orders ?? [];
      const cutoff = Date.now() - 5 * 60 * 1000;
      const match = orders.find(
        (o) =>
          o.provider?.id === forProviderId &&
          new Date(o.created_at).getTime() >= cutoff &&
          o.payment_status !== "failed" &&
          o.status !== "cancelled",
      );
      if (!match) return null;
      const walletApplied = Number(match.wallet_amount ?? 0);
      const alreadyPaid = match.payment_status === "paid";
      return {
        id: match.id,
        order_number: match.order_number,
        // Reused by checkout to skip Paystack when recovery finds a settled order.
        paid_with_wallet: alreadyPaid,
        amount_due: alreadyPaid ? 0 : Math.max(0, total - walletApplied),
      };
    } catch {
      return null;
    }
  };

  const handlePlaceOrder = useCallback(async () => {
    if (!providerId) {
      setPageError("Missing provider. Please go back to cart and try again.");
      return;
    }
    if (fulfillment === "delivery" && !selectedAddress) {
      setPageError("Please select a delivery address.");
      return;
    }
    if (fulfillment === "collection" && !selectedLocation) {
      setPageError("Please select a collection point.");
      return;
    }

    setPlacing(true);
    setPageError(null);

    const idempotencyKey = createWebOrderIdempotencyKey();
    let order:
      | { id: string; order_number: string }
      | undefined;
    let paidWithWallet = false;
    let amountDue = total;

    try {
      const orderRes = await fetcher.post<{
        data: {
          order: { id: string; order_number: string };
          paid_with_wallet?: boolean;
          amount_due?: number;
        };
      }>(
        "/api/me/orders",
        {
          provider_id: providerId,
          fulfillment_type: fulfillment,
          delivery_address_id: fulfillment === "delivery" ? selectedAddress : undefined,
          collection_location_id: fulfillment === "collection" ? selectedLocation : undefined,
          payment_method: paymentMethod,
          use_wallet: paymentMethod === "paystack" ? useWallet : false,
          ...(promotionCode.trim() ? { promotion_code: promotionCode.trim() } : {}),
          ...(giftCardCode.trim()
            ? { gift_card: { code: giftCardCode.trim().toUpperCase() } }
            : {}),
          idempotency_key: idempotencyKey,
        },
        {
          timeoutMs: 120_000,
          headers: { "Idempotency-Key": idempotencyKey },
        },
      );

      order = orderRes?.data?.order;
      paidWithWallet = orderRes?.data?.paid_with_wallet === true;
      amountDue = orderRes?.data?.amount_due ?? total;
    } catch (createErr) {
      if (isTransientNetworkFetchError(createErr)) {
        const recovered = await recoverRecentWebOrder(providerId);
        if (recovered) {
          order = recovered;
          paidWithWallet = recovered.paid_with_wallet === true;
          amountDue = recovered.amount_due ?? total;
        } else {
          setPageError(
            "We could not confirm whether your order went through. Check My Orders before trying again.",
          );
          setPlacing(false);
          return;
        }
      } else {
        setPageError(
          createErr instanceof FetchError
            ? createErr.message
            : createErr instanceof Error
              ? createErr.message
              : "Could not place order. Please try again.",
        );
        setPlacing(false);
        return;
      }
    }

    try {
      if (paymentMethod === "card_on_delivery" || paidWithWallet || amountDue <= 0.005) {
        router.push("/account-settings/orders");
        return;
      }

      if (!order || !user?.email) {
        router.push("/account-settings/orders");
        return;
      }

      const cancelledPath = `/shop/cancelled?order_id=${encodeURIComponent(order.id)}&order_number=${encodeURIComponent(order.order_number)}`;

      const usingSavedCard =
        paymentMethod === "paystack" &&
        paystackEnabled &&
        !useNewCard &&
        Boolean(selectedCardId) &&
        savedCards.some((c) => c.id === selectedCardId) &&
        amountDue > 0.005;

      if (usingSavedCard && selectedCardId) {
        try {
          const chargeRes = await fetcher.post<{
            data?: { status?: string; transaction?: { status?: string } };
            status?: string;
          }>("/api/payments/charge-saved-card", {
            payment_method_id: selectedCardId,
            email: user.email,
            metadata: {
              product_order_id: order.id,
              type: "product_order",
            },
          }, { timeoutMs: 120_000 });
          const txStatus =
            chargeRes?.data?.status ??
            chargeRes?.data?.transaction?.status ??
            chargeRes?.status ??
            "";
          if (String(txStatus).toLowerCase() !== "success") {
            const paidAnyway = await pollWebProductOrderPaid(order.id);
            if (paidAnyway) {
              router.push("/account-settings/orders");
              return;
            }
            setPageError(
              `Your order #${order.order_number} was created. Complete payment from My Orders — the card charge did not finish yet.`,
            );
            return;
          }
          router.push("/account-settings/orders");
          return;
        } catch (chargeErr) {
          const paidAnyway = await pollWebProductOrderPaid(order.id);
          if (paidAnyway) {
            router.push("/account-settings/orders");
            return;
          }
          const msg =
            chargeErr instanceof FetchError
              ? chargeErr.message
              : chargeErr instanceof Error
                ? chargeErr.message
                : "Card charge failed";
          setPageError(
            `${msg} Your order #${order.order_number} was created. Complete payment from My Orders or try again below.`,
          );
        }
      }

      // Initialize Paystack for remaining amount (new card, wallet remainder, or saved-card fallback)
      const payRes = await fetcher.post<{
        data: { authorization_url: string; reference: string };
      }>("/api/paystack/initialize", {
        email: user.email,
        amount: Math.round(amountDue * 100),
        metadata: {
          product_order_id: order.id,
          order_number: order.order_number,
          type: "product_order",
          cancel_action: cancelledPath,
        },
      }, { timeoutMs: 120_000 });

      if (payRes?.data?.authorization_url) {
        window.location.href = payRes.data.authorization_url;
      } else {
        setPageError(
          `Your order #${order.order_number} was created but we could not open payment. Complete it from My Orders.`,
        );
      }
    } catch (err) {
      if (order) {
        setPageError(
          `Your order #${order.order_number} was created but payment could not be started. Complete it from My Orders.`,
        );
      } else {
        setPageError(
          err instanceof FetchError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not complete checkout. Please try again.",
        );
      }
    } finally {
      setPlacing(false);
    }
  }, [
    providerId,
    fulfillment,
    selectedAddress,
    selectedLocation,
    paymentMethod,
    useWallet,
    user,
    total,
    router,
    paystackEnabled,
    savedCards,
    useNewCard,
    selectedCardId,
    promotionCode,
    giftCardCode,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!providerId || items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {requiresProviderSelection ? "Select a provider to continue" : "No items to checkout"}
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            {requiresProviderSelection
              ? "Your cart has items from multiple providers. Choose checkout from a provider group in cart."
              : "Add items to your cart to continue."}
          </p>
          <Link href="/cart" className="text-pink-600 hover:underline">
            Go to cart
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to cart
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

        <div className="grid gap-6">
          {pageError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              {pageError}
            </div>
          )}
          {!hasAnyEnabledPaymentMethod && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              No payment methods are currently enabled for on-platform checkout. Please contact
              support.
            </div>
          )}
          {/* Fulfillment type */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              How would you like to receive your order?
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {shippingConfig?.offers_collection !== false && (
                <button
                  onClick={() => setFulfillment("collection")}
                  className={`p-4 rounded-xl border-2 text-center transition-colors ${
                    fulfillment === "collection"
                      ? "border-pink-500 bg-pink-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Store
                    className={`w-6 h-6 mx-auto mb-2 ${fulfillment === "collection" ? "text-pink-600" : "text-gray-400"}`}
                  />
                  <p
                    className={`font-medium ${fulfillment === "collection" ? "text-pink-600" : "text-gray-700"}`}
                  >
                    Collection
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Free</p>
                </button>
              )}
              {shippingConfig?.offers_delivery && (
                <button
                  onClick={() => setFulfillment("delivery")}
                  className={`p-4 rounded-xl border-2 text-center transition-colors ${
                    fulfillment === "delivery"
                      ? "border-pink-500 bg-pink-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Truck
                    className={`w-6 h-6 mx-auto mb-2 ${fulfillment === "delivery" ? "text-pink-600" : "text-gray-400"}`}
                  />
                  <p
                    className={`font-medium ${fulfillment === "delivery" ? "text-pink-600" : "text-gray-700"}`}
                  >
                    Delivery
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {deliveryFee === 0 ? "Free" : `${tenantCurrency} ${deliveryFee.toFixed(2)}`}
                  </p>
                </button>
              )}
            </div>
          </div>

          {/* Collection point or delivery address */}
          {fulfillment === "collection" && locations.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Collection Point</h3>
              <div className="space-y-3">
                {locations.map((loc) => (
                  <label
                    key={loc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedLocation === loc.id
                        ? "border-pink-500 bg-pink-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="location"
                      checked={selectedLocation === loc.id}
                      onChange={() => setSelectedLocation(loc.id)}
                      className="accent-pink-600"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{loc.name}</p>
                      <p className="text-sm text-gray-500">
                        {loc.address_line1}, {loc.city}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {fulfillment === "delivery" && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Delivery Address</h3>
              {shippingConfig?.estimated_delivery_days != null &&
                Number(shippingConfig.estimated_delivery_days) > 0 && (
                  <p className="text-sm text-gray-500 mb-4">
                    Estimated delivery: within {Number(shippingConfig.estimated_delivery_days)}{" "}
                    business day{Number(shippingConfig.estimated_delivery_days) !== 1 ? "s" : ""}
                  </p>
                )}
              {addresses.length === 0 ? (
                <div className="text-center py-4">
                  <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 mb-3">No saved addresses</p>
                  <Link
                    href="/account-settings/addresses"
                    className="text-pink-600 font-medium hover:underline"
                  >
                    Add an address
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <label
                      key={addr.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedAddress === addr.id
                          ? "border-pink-500 bg-pink-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={selectedAddress === addr.id}
                        onChange={() => setSelectedAddress(addr.id)}
                        className="accent-pink-600"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{addr.label ?? "Address"}</p>
                        <p className="text-sm text-gray-500">
                          {addr.address_line1}, {addr.city}
                          {addr.postal_code ? `, ${addr.postal_code}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Promo & gift card</h3>
            <div className="space-y-3">
              <input
                value={promotionCode}
                onChange={(e) => setPromotionCode(e.target.value)}
                placeholder="Promotion code"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                autoCapitalize="characters"
              />
              <input
                value={giftCardCode}
                onChange={(e) => setGiftCardCode(e.target.value)}
                placeholder="Gift card code"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                autoCapitalize="characters"
              />
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Payment Method</h3>
            {!paystackEnabled && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                Online payment is currently unavailable. Please pay when you receive your order.
              </p>
            )}
            {/* Pay-on-delivery availability is reflected by showing/hiding the cash option below — no need to expose internal platform policy to customers */}
            <div className="space-y-3">
              {paystackEnabled && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === "paystack"
                      ? "border-pink-500 bg-pink-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === "paystack"}
                    onChange={() => setPaymentMethod("paystack")}
                    className="accent-pink-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Pay Online</p>
                    <p className="text-xs text-gray-500">
                      Secure payment with card (card, EFT, etc.)
                    </p>
                  </div>
                </label>
              )}
              {paymentMethod === "paystack" &&
                user &&
                paystackEnabled &&
                !useWallet &&
                cardsLoading && (
                  <div className="space-y-2 pl-1">
                    <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                    <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                  </div>
                )}
              {paymentMethod === "paystack" &&
                user &&
                paystackEnabled &&
                !useWallet &&
                !cardsLoading &&
                savedCards.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <p className="text-sm font-medium text-gray-700">Your saved cards</p>
                    {!useNewCard ? (
                      <>
                        <div className="space-y-2">
                          {savedCards.map((card) => {
                            const active = selectedCardId === card.id;
                            const brand = card.card_type
                              ? card.card_type.charAt(0).toUpperCase() + card.card_type.slice(1)
                              : "Card";
                            const expiry =
                              card.expiry_label ??
                              (card.expiry_month && card.expiry_year
                                ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                                : null);
                            return (
                              <div
                                key={card.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedCardId(card.id);
                                  setUseNewCard(false);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedCardId(card.id);
                                    setUseNewCard(false);
                                  }
                                }}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left cursor-pointer ${
                                  active
                                    ? "border-pink-500 bg-pink-50"
                                    : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                              >
                                <div
                                  className={`w-10 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                    active ? "bg-pink-100" : "bg-gray-100"
                                  }`}
                                >
                                  <CreditCard
                                    className={`w-5 h-5 ${active ? "text-pink-600" : "text-gray-500"}`}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`text-sm font-semibold ${active ? "text-pink-600" : "text-gray-900"}`}
                                    >
                                      {brand}
                                      {card.last4 ? ` •••• ${card.last4}` : ""}
                                    </span>
                                    {card.is_default ? (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">
                                        Default
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleSetDefaultCard(card.id);
                                        }}
                                        disabled={settingDefaultId === card.id}
                                        className="text-[10px] font-semibold text-pink-600 hover:text-pink-700 underline disabled:opacity-50"
                                      >
                                        {settingDefaultId === card.id ? "Updating…" : "Set default"}
                                      </button>
                                    )}
                                  </div>
                                  {expiry ? (
                                    <span className="text-xs text-gray-500">Expires {expiry}</span>
                                  ) : null}
                                </div>
                                {active ? (
                                  <CheckCircle className="w-5 h-5 text-pink-600 shrink-0" />
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRemoveSavedCard(card.id);
                                  }}
                                  disabled={removingCardId === card.id}
                                  aria-label={`Remove card ending in ${card.last4 ?? "****"}`}
                                  title="Remove this card"
                                  className="ml-1 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUseNewCard(true);
                            setSelectedCardId(null);
                          }}
                          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-sm font-medium">Use a new card</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setUseNewCard(false);
                            const def = savedCards.find((c) => c.is_default) ?? savedCards[0];
                            if (def) setSelectedCardId(def.id);
                          }}
                          className="flex items-center gap-2 text-sm text-pink-600 hover:text-pink-700 font-medium transition-colors"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Use a saved card instead
                        </button>
                        <p className="text-xs text-gray-500 pl-1">
                          You will be redirected to our secure payment page to enter card details.
                        </p>
                      </>
                    )}
                  </div>
                )}
              {paymentMethod === "paystack" && user && walletBalance > 0 && walletEnabled && (
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                    className="accent-pink-600 rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Use wallet balance — {tenantCurrency}
                    {Number(walletBalance).toFixed(2)} available
                  </span>
                </label>
              )}
              {cashEnabledOnPlatform && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    paymentMethod === "card_on_delivery"
                      ? "border-pink-500 bg-pink-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === "card_on_delivery"}
                    onChange={() => setPaymentMethod("card_on_delivery")}
                    className="accent-pink-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      Pay at {fulfillment === "delivery" ? "Delivery" : "Collection"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Cash or card when you receive your order
                    </p>
                  </div>
                </label>
              )}
            </div>
            {paymentMethod === "paystack" && platformFeeConfig.show && platformFee > 0 && (
              <div className="mt-3 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                A platform fee of {tenantCurrency} {platformFee.toFixed(2)} applies to online
                payments
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
            <div className="space-y-3 mb-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-gray-700">
                    {item.product?.name}
                    {item.product_variant?.option_values &&
                      Object.keys(item.product_variant.option_values).length > 0 && (
                        <span className="text-gray-500 font-normal">
                          {" "}
                          ·{" "}
                          {Object.entries(item.product_variant.option_values)
                            .map(([, v]) => v)
                            .join(", ")}
                        </span>
                      )}{" "}
                    x{item.quantity}
                  </span>
                  <span className="flex-shrink-0 font-medium text-gray-900 whitespace-nowrap">
                    {tenantCurrency}
                    {linePrice(item).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-900">
                  {tenantCurrency}
                  {subtotal.toFixed(2)}
                </span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tax</span>
                  <span className="text-gray-900">
                    {tenantCurrency}
                    {taxAmount.toFixed(2)}
                  </span>
                </div>
              )}
              {fulfillment === "delivery" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delivery</span>
                  <span className={deliveryFee === 0 ? "text-green-600" : "text-gray-900"}>
                    {deliveryFee === 0 ? "Free" : `${tenantCurrency}${deliveryFee.toFixed(2)}`}
                  </span>
                </div>
              )}
              {platformFee > 0 && platformFeeConfig.show && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Platform Fee</span>
                  <span className="text-gray-900">
                    {tenantCurrency}
                    {platformFee.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span className="text-gray-900">Total</span>
                <span className="text-pink-600">
                  {tenantCurrency}
                  {total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {hasOutOfStock && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Some items in your cart are out of stock. Please update your cart before placing the
              order.
            </div>
          )}

          {/* Pay button */}
          <button
            onClick={handlePlaceOrder}
            disabled={placing || !hasAnyEnabledPaymentMethod || hasOutOfStock}
            className="w-full py-4 bg-pink-600 text-white rounded-xl font-bold text-lg hover:bg-pink-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {placing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              `${paymentMethod === "paystack" ? "Pay &" : ""} Place Order — ${tenantCurrency}${total.toFixed(2)}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

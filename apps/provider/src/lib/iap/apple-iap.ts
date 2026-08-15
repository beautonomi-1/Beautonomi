/**
 * Native StoreKit 2 purchase flow for Beautonomi Partner (iOS).
 * Finishes transactions only after POST /api/provider/iap/verify succeeds.
 */

import { Linking } from "react-native";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { shouldUseAppleIap } from "@/lib/iap/platform";

export type AppleStoreOffer = {
  id: string;
  type: "introductory" | "promotional" | "winback" | "unknown";
};

export type AppleStoreProduct = {
  id: string;
  title?: string;
  description?: string;
  displayPrice?: string;
  price?: number;
  currency?: string;
  type?: string;
  /** Eligible StoreKit offers. Intro applies automatically; only promotional offers are signed server-side. Win-back is presented by the App Store. */
  offers?: AppleStoreOffer[];
};

export type ApplePurchaseResult =
  | { ok: true; transactionId?: string; productId: string }
  | { ok: false; cancelled?: boolean; error: string };

type ExpoIapModule = typeof import("expo-iap");

let connectionPromise: Promise<boolean> | null = null;
let iapModule: ExpoIapModule | null = null;

async function loadIapModule(): Promise<ExpoIapModule | null> {
  if (!shouldUseAppleIap()) return null;
  if (iapModule) return iapModule;
  try {
    iapModule = await import("expo-iap");
    return iapModule;
  } catch {
    return null;
  }
}

export async function connectAppleIap(): Promise<boolean> {
  if (!shouldUseAppleIap()) return false;
  if (connectionPromise) return connectionPromise;
  connectionPromise = (async () => {
    const mod = await loadIapModule();
    if (!mod) return false;
    try {
      await mod.initConnection();
      return true;
    } catch {
      connectionPromise = null;
      return false;
    }
  })();
  return connectionPromise;
}

export async function fetchAppleStoreProducts(productIds: string[]): Promise<AppleStoreProduct[]> {
  const mod = await loadIapModule();
  if (!mod || productIds.length === 0) return [];
  await connectAppleIap();
  const unique = [...new Set(productIds.filter(Boolean))];
  const products = await mod.fetchProducts({ skus: unique, type: "all" });
  if (!Array.isArray(products)) return [];
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    displayPrice: p.displayPrice,
    price: typeof p.price === "number" ? p.price : undefined,
    currency: p.currency,
    type: p.type,
    offers: extractStoreOffers(p),
  }));
}

function normalizeOfferType(raw: string | undefined): AppleStoreOffer["type"] {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("intro")) return "introductory";
  if (t.includes("win")) return "winback";
  if (t.includes("promo")) return "promotional";
  return "unknown";
}

function extractStoreOffers(product: unknown): AppleStoreOffer[] {
  const record = asPurchaseRecord(product);
  const offers: AppleStoreOffer[] = [];
  const seen = new Set<string>();
  const push = (id: unknown, type?: unknown) => {
    if (typeof id !== "string" || !id.trim() || seen.has(id)) return;
    seen.add(id);
    offers.push({ id: id.trim(), type: normalizeOfferType(typeof type === "string" ? type : undefined) });
  };
  const lists = [record.subscriptionOffers, record.discountOffers, record.discountsIOS, record.discounts];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      push(row.id ?? row.identifier, row.type ?? row.offerType);
    }
  }
  return offers;
}

/** Promotional offer ids StoreKit says this Apple ID is eligible for. Intro offers apply without a signature. Win-back offers are presented by StoreKit, not signed as promotional discounts. */
export function eligibleSignedOfferIds(product: AppleStoreProduct | undefined): string[] {
  if (!product?.offers?.length) return [];
  return product.offers
    .filter((offer) => offer.type === "promotional")
    .map((offer) => offer.id);
}

function asPurchaseRecord(purchase: unknown): Record<string, unknown> {
  return purchase as Record<string, unknown>;
}
function extractSignedTransaction(purchase: unknown): string | null {
  const record = asPurchaseRecord(purchase);
  const candidates = [
    record.transactionJwsIOS,
    record.transactionReceipt,
    record.purchaseToken,
    record.transactionId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes(".") && c.split(".").length >= 3) {
      return c;
    }
  }
  return null;
}

async function verifyPurchaseWithServer(opts: {
  signedTransaction: string;
  appAccountToken?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await api.post<{ transaction_id?: string }>("/api/provider/iap/verify", {
    signed_transaction: opts.signedTransaction,
    app_account_token: opts.appAccountToken,
  });
  if (res.error) {
    return { ok: false, error: getApiErrorMessage(res.error, "Apple purchase verification failed") };
  }
  return { ok: true };
}

export async function purchaseAppleProduct(opts: {
  productId: string;
  appAccountToken: string;
  /** subscription | inapp */
  kind?: "subscription" | "inapp";
  /** StoreKit promotional offer signed by our server. Do not pass win-back or intro ids. */
  withOffer?: {
    identifier: string;
    keyIdentifier: string;
    nonce: string;
    signature: string;
    timestamp: number;
  };
}): Promise<ApplePurchaseResult> {
  const mod = await loadIapModule();
  if (!mod) {
    return { ok: false, error: "In-app purchases are only available on iOS." };
  }
  await connectAppleIap();

  try {
    const appleRequest = {
      sku: opts.productId,
      appAccountToken: opts.appAccountToken,
      ...(opts.withOffer ? { withOffer: opts.withOffer } : {}),
    };
    const purchase = await mod.requestPurchase({
      request: {
        apple: appleRequest,
        ios: appleRequest,
        google: { skus: [opts.productId] },
        android: { skus: [opts.productId] },
      },
      type: opts.kind === "subscription" ? "subs" : "in-app",
    });

    const purchaseRecord =
      purchase && typeof purchase === "object"
        ? (Array.isArray(purchase) ? purchase[0] : purchase)
        : null;
    if (!purchaseRecord || typeof purchaseRecord !== "object") {
      return { ok: false, error: "No purchase returned from the App Store." };
    }

    const signed = extractSignedTransaction(purchaseRecord);
    if (!signed) {
      return { ok: false, error: "Could not read signed transaction from purchase." };
    }

    const verified = await verifyPurchaseWithServer({
      signedTransaction: signed,
      appAccountToken: opts.appAccountToken,
    });
    if (!verified.ok) {
      return { ok: false, error: verified.error ?? "Server verification failed" };
    }

    try {
      await mod.finishTransaction({ purchase: purchaseRecord as never, isConsumable: opts.kind !== "subscription" });
    } catch {
      /* server acknowledged — finishing is best-effort */
    }

    const txId =
      typeof (purchaseRecord as { transactionId?: string }).transactionId === "string"
        ? (purchaseRecord as { transactionId: string }).transactionId
        : undefined;

    return { ok: true, transactionId: txId, productId: opts.productId };
  } catch (e) {
    if (isUserCancellation(e)) {
      return { ok: false, cancelled: true, error: "Purchase cancelled" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "Purchase failed" };
  }
}

/**
 * Only a genuine dismissal counts as a cancellation, because callers stay silent
 * for those. Matching loosely (for example on the word "user") would turn real
 * StoreKit failures into a button that appears to do nothing.
 */
function isUserCancellation(error: unknown): boolean {
  const code = String(
    (error as { code?: unknown })?.code ?? (error as { userCancelled?: unknown })?.userCancelled ?? "",
  ).toLowerCase();
  if (code === "true" || code.includes("user_cancel") || code.includes("user-cancel")) {
    return true;
  }
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return message.includes("cancel");
}

function accountTokenForPurchase(purchase: unknown, fallbackProviderId: string): string {
  const record = asPurchaseRecord(purchase);
  const fromStore =
    typeof record.appAccountToken === "string" ? record.appAccountToken.trim() : "";
  // Ads consumables store the budget-order UUID here; subscriptions store the
  // provider UUID. Never replace a real token with the current session id —
  // that is what made Restore fail to fund an unfinished ads pack.
  return fromStore || fallbackProviderId;
}

async function verifyAndFinishPurchase(
  purchase: unknown,
  providerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const mod = await loadIapModule();
  if (!mod) return { ok: false, error: "In-app purchases are only available on iOS." };
  const signed = extractSignedTransaction(purchase);
  if (!signed) return { ok: false, error: "Could not read signed transaction from purchase." };
  const verified = await verifyPurchaseWithServer({
    signedTransaction: signed,
    appAccountToken: accountTokenForPurchase(purchase, providerId),
  });
  if (!verified.ok) return verified;
  try {
    const record = asPurchaseRecord(purchase);
    const productId = String(record.productId ?? record.id ?? "");
    const isSub = productId.includes(".sub.");
    await mod.finishTransaction({
      purchase: purchase as never,
      isConsumable: !isSub,
    });
  } catch {
    /* server acknowledged — finishing is best-effort */
  }
  return { ok: true };
}

export async function restoreApplePurchases(providerId: string): Promise<{ ok: boolean; error?: string }> {
  const mod = await loadIapModule();
  if (!mod) return { ok: false, error: "Restore is only available on iOS." };
  await connectAppleIap();
  try {
    const purchases = await mod.getAvailablePurchases();
    if (!Array.isArray(purchases) || purchases.length === 0) {
      return { ok: true };
    }
    let lastError: string | undefined;
    let anyOk = false;
    for (const purchase of purchases) {
      const result = await verifyAndFinishPurchase(purchase, providerId);
      if (result.ok) anyOk = true;
      else if (result.error) lastError = result.error;
    }
    if (anyOk) return { ok: true };
    if (lastError) return { ok: false, error: lastError };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Restore failed" };
  }
}

export async function syncUnfinishedApplePurchases(providerId: string): Promise<void> {
  const mod = await loadIapModule();
  if (!mod) return;
  await connectAppleIap();
  try {
    const purchases = await mod.getAvailablePurchases();
    if (!Array.isArray(purchases)) return;
    for (const purchase of purchases) {
      await verifyAndFinishPurchase(purchase, providerId);
    }
  } catch {
    /* ignore — retry on next app open */
  }
}

/**
 * Listens for StoreKit updates (renewals, unfinished transactions) for the
 * life of the signed-in session. Returns an unsubscribe function.
 */
export async function startApplePurchaseListener(
  providerId: string,
): Promise<() => void> {
  const mod = await loadIapModule();
  if (!mod) return () => undefined;
  await connectAppleIap();

  const subscribe = (mod as { purchaseUpdatedListener?: (cb: (p: unknown) => void) => { remove?: () => void } })
    .purchaseUpdatedListener;
  if (typeof subscribe !== "function") {
    return () => undefined;
  }

  const subscription = subscribe((purchase) => {
    void verifyAndFinishPurchase(purchase, providerId);
  });
  return () => {
    try {
      subscription?.remove?.();
    } catch {
      /* listener already gone */
    }
  };
}

export function openAppleSubscriptionManagement(): void {
  void (async () => {
    const mod = await loadIapModule();
    const showManage = (mod as { showManageSubscriptionsIOS?: () => Promise<unknown> } | null)
      ?.showManageSubscriptionsIOS;
    if (typeof showManage === "function") {
      try {
        await showManage();
        return;
      } catch {
        /* fall through to the public subscriptions URL */
      }
    }
    await Linking.openURL("https://apps.apple.com/account/subscriptions");
  })();
}

/**
 * Presents Apple's offer-code redemption sheet. Intro offers still apply on
 * purchase without this; this is how a customer redeems an App Store Connect
 * offer code. After the sheet, unfinished transactions are synced.
 */
export async function presentAppleOfferCodeSheet(providerId: string): Promise<{ ok: boolean; error?: string }> {
  const mod = await loadIapModule();
  if (!mod) return { ok: false, error: "Offer codes are only available on iOS." };
  await connectAppleIap();
  const present = (mod as { presentCodeRedemptionSheetIOS?: () => Promise<unknown> })
    .presentCodeRedemptionSheetIOS;
  if (typeof present !== "function") {
    return { ok: false, error: "Offer-code redemption is not available in this build." };
  }
  try {
    await present();
    const syncIos = (mod as { syncIOS?: () => Promise<unknown> }).syncIOS;
    if (typeof syncIos === "function") {
      try {
        await syncIos();
      } catch {
        /* StoreKit sync is best-effort; unfinished purchases still retry below */
      }
    }
    await syncUnfinishedApplePurchases(providerId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not open the offer-code sheet" };
  }
}

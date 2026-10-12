import { useCallback, useEffect, useRef } from "react";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { isCancelledPaystackUrl } from "@/lib/paystack-webview-utils";

export type InAppPaystackResult =
  | { outcome: "success"; url: string }
  | { outcome: "cancel"; url?: string }
  | { outcome: "closed" }
  | { outcome: "start_failed"; message?: string };

/**
 * PCI DSS SAQ A guard: Paystack hosted checkout must only ever be opened
 * against a Paystack-controlled host. Defends against a server bug or
 * supply-chain attack returning a non-Paystack `authorization_url`.
 */
const PAYSTACK_HOST_ALLOWLIST = new Set<string>([
  "checkout.paystack.com",
  "standard.paystack.co",
  "paystack.shop",
  "api.paystack.co",
]);

const STRIPE_HOST_ALLOWLIST = new Set<string>(["checkout.stripe.com", "pay.stripe.com"]);
const FLUTTERWAVE_HOST_ALLOWLIST = new Set<string>(["checkout.flutterwave.com"]);

function assertHostedCheckoutUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("[checkout] URL is not valid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("[checkout] URL must use https");
  }
  const host = parsed.hostname.toLowerCase();
  const paystackAllowed =
    PAYSTACK_HOST_ALLOWLIST.has(host) ||
    host.endsWith(".paystack.com") ||
    host.endsWith(".paystack.co") ||
    host.endsWith(".paystack.shop");
  const stripeAllowed =
    STRIPE_HOST_ALLOWLIST.has(host) || host.endsWith(".stripe.com");
  const flutterwaveAllowed = FLUTTERWAVE_HOST_ALLOWLIST.has(host);
  if (!paystackAllowed && !stripeAllowed && !flutterwaveAllowed) {
    throw new Error(`[checkout] refusing to open untrusted host: ${host}`);
  }
}

function assertPaystackUrl(url: string): void {
  assertHostedCheckoutUrl(url);
}

export function useInAppPaystackCheckout() {
  const resolverRef = useRef<((r: InAppPaystackResult) => void) | null>(null);

  const waitForCheckout = useCallback(
    (
      url: string,
      options: {
        matchSuccess: (u: string) => boolean;
        matchCancel?: (u: string) => boolean;
        title?: string;
        returnUrl?: string;
      },
    ): Promise<InAppPaystackResult> => {
      return new Promise(async (resolve) => {
        if (resolverRef.current) resolverRef.current({ outcome: "closed" });
        resolverRef.current = resolve;
        const returnUrl = options.returnUrl ?? ExpoLinking.createURL("paystack-callback");
        try {
          assertPaystackUrl(url);
          const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
          if (!resolverRef.current) return;
          resolverRef.current = null;

          if (result.type === "success" && result.url) {
            if (options.matchCancel?.(result.url) || isCancelledPaystackUrl(result.url)) {
              resolve({ outcome: "cancel", url: result.url });
              return;
            }
            if (options.matchSuccess(result.url)) {
              resolve({ outcome: "success", url: result.url });
              return;
            }
          }
          resolve({ outcome: "closed" });
        } catch (err) {
          if (resolverRef.current) {
            resolverRef.current = null;
            const message = err instanceof Error ? err.message : undefined;
            resolve({ outcome: "start_failed", message });
          }
        }
      });
    },
    [],
  );

  useEffect(
    () => () => {
      if (resolverRef.current) {
        resolverRef.current({ outcome: "closed" });
        resolverRef.current = null;
      }
    },
    [],
  );

  const modal = null;
  return { waitForCheckout, modal };
}

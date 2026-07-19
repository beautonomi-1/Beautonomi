import { useCallback, useEffect, useRef } from "react";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export type InAppPaystackResult =
  | { outcome: "success"; url: string }
  | { outcome: "cancel"; url?: string }
  | { outcome: "closed" };

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
  if (!paystackAllowed && !stripeAllowed) {
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
            if (options.matchCancel?.(result.url) || result.url.includes("cancelled=1")) {
              resolve({ outcome: "cancel", url: result.url });
              return;
            }
            if (options.matchSuccess(result.url)) {
              resolve({ outcome: "success", url: result.url });
              return;
            }
          }
          resolve({ outcome: "closed" });
        } catch {
          if (resolverRef.current) {
            resolverRef.current = null;
            resolve({ outcome: "closed" });
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

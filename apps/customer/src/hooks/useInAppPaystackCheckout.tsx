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

function assertPaystackUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("[paystack] checkout URL is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("[paystack] checkout URL must use https");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    PAYSTACK_HOST_ALLOWLIST.has(host) ||
    host.endsWith(".paystack.com") ||
    host.endsWith(".paystack.co") ||
    host.endsWith(".paystack.shop");
  if (!allowed) {
    throw new Error(
      `[paystack] refusing to open non-Paystack host: ${host}`,
    );
  }
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

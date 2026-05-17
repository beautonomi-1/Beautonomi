import { useCallback, useEffect, useRef } from "react";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export type InAppPaystackResult =
  | { outcome: "success"; url: string }
  | { outcome: "cancel"; url?: string }
  | { outcome: "closed" };

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

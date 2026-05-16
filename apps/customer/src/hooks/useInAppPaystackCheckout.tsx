import { useCallback, useRef, useState } from "react";
import { PaystackWebViewModal } from "@/components/payments/PaystackWebViewModal";

export type InAppPaystackResult =
  | { outcome: "success"; url: string }
  | { outcome: "cancel"; url?: string }
  | { outcome: "closed" };

type Session = {
  url: string;
  title?: string;
  matchSuccess: (u: string) => boolean;
  matchCancel?: (u: string) => boolean;
};

/**
 * Promise-based in-app Paystack WebView. Render `modal` inside your screen tree (e.g. fragment at end of JSX).
 */
export function useInAppPaystackCheckout() {
  const [session, setSession] = useState<Session | null>(null);
  const resolverRef = useRef<((r: InAppPaystackResult) => void) | null>(null);

  const waitForCheckout = useCallback(
    (
      url: string,
      options: {
        matchSuccess: (u: string) => boolean;
        matchCancel?: (u: string) => boolean;
        title?: string;
      },
    ): Promise<InAppPaystackResult> => {
      return new Promise((resolve) => {
        resolverRef.current = resolve;
        setSession({
          url,
          title: options.title,
          matchSuccess: options.matchSuccess,
          matchCancel: options.matchCancel,
        });
      });
    },
    [],
  );

  const onModalComplete = useCallback((result: { outcome: "success" | "cancel" | "closed"; url?: string }) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setSession(null);
    if (!resolve) return;
    if (result.outcome === "success" && result.url) {
      resolve({ outcome: "success", url: result.url });
      return;
    }
    if (result.outcome === "cancel") {
      resolve({ outcome: "cancel", url: result.url });
      return;
    }
    resolve({ outcome: "closed" });
  }, []);

  const modal = session ? (
    <PaystackWebViewModal
      visible
      title={session.title}
      authorizationUrl={session.url}
      matchSuccess={session.matchSuccess}
      matchCancel={session.matchCancel}
      onComplete={onModalComplete}
    />
  ) : null;

  return { waitForCheckout, modal };
}

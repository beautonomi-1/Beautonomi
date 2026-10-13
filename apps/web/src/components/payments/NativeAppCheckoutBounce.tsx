"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  resolveCustomerNativeBouncePath,
  resolveProviderNativeBouncePath,
} from "@/lib/payments/native-app-checkout-bounce";

/**
 * Immediately redirects in-app hosted checkout landings to the native app scheme
 * so `WebBrowser.openAuthSessionAsync` can complete (Custom Tab / ASWebAuthenticationSession).
 * Shows a minimal bridge screen so users never briefly see the full desktop success page.
 */
export function NativeAppCheckoutBounce() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const didBounce = useRef(false);

  const bounceTarget = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return (
      resolveCustomerNativeBouncePath(pathname, params) ??
      resolveProviderNativeBouncePath(pathname, params)
    );
  }, [pathname, searchParams]);

  useLayoutEffect(() => {
    if (!bounceTarget || didBounce.current || typeof window === "undefined") return;
    didBounce.current = true;
    window.location.replace(bounceTarget);
  }, [bounceTarget]);

  if (!bounceTarget) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#F3F4F6",
        padding: 24,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 600, color: "#111827", margin: 0 }}>
        Completing your payment…
      </p>
      <p style={{ fontSize: 14, color: "#6B7280", marginTop: 8, maxWidth: 280 }}>
        Returning you to the Beautonomi app. This usually takes a moment.
      </p>
    </div>
  );
}

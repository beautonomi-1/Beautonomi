"use client";

import { Suspense, useEffect } from "react";
import { NativeAppCheckoutBounce } from "@/components/payments/NativeAppCheckoutBounce";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { XCircle } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";

const ACCENT = "var(--primary, #FF0077)";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6B7280";

function isNativeAppContext(context: string | null): boolean {
  return context === "app";
}

function CancelledContent() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const bookingId = params.get("booking_id");
  const paymentType = params.get("payment_type");
  const offerId = params.get("offer_id");
  const nativeContext = isNativeAppContext(params.get("context"));

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      let reference =
        params.get("reference") || params.get("trxref") || params.get("tx_ref") || "";
      if (!reference && bookingId) {
        try {
          const bookingRes = await fetch(`/api/me/bookings/${encodeURIComponent(bookingId)}`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (bookingRes.ok) {
            const json = await bookingRes.json();
            const stored = json?.data?.payment_reference;
            if (typeof stored === "string") reference = stored;
          }
        } catch {
          // The cancel screen still renders if lookup fails.
        }
      }
      if (!reference || ignore) return;
      await fetch(
        `/api/paystack/verify?reference=${encodeURIComponent(reference)}&status=cancelled`,
        { credentials: "include", headers: { Accept: "application/json" } },
      ).catch(() => undefined);
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [params, bookingId]);

  useEffect(() => {
    if (!nativeContext || typeof window === "undefined") return;
    const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
    if (!w.ReactNativeWebView?.postMessage) return;
    try {
      w.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "checkout_failed",
          status: "cancelled",
          payment_type: paymentType ?? "",
          booking_id: bookingId ?? undefined,
          offer_id: offerId ?? undefined,
        }),
      );
    } catch {
      // ignore
    }
  }, [nativeContext, paymentType, bookingId, offerId]);

  let backHref = "/";
  let backLabel = t("checkout.cancelledGoHome");

  if (paymentType === "custom_offer" && offerId) {
    backHref = "/account-settings/custom-requests";
    backLabel = t("checkout.cancelledBackToOffer");
  } else if (bookingId) {
    backHref = `/bookings/${encodeURIComponent(bookingId)}/pay`;
    backLabel = t("checkout.cancelledReturnToBooking");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          padding: "48px 40px",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <XCircle
          size={56}
          color={TEXT_SECONDARY}
          style={{ margin: "0 auto 24px" }}
        />
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: TEXT_PRIMARY,
            marginBottom: "12px",
          }}
        >
          {t("checkout.paymentCancelledTitle")}
        </h1>
        <p
          style={{
            fontSize: "16px",
            color: TEXT_SECONDARY,
            lineHeight: "1.6",
            marginBottom: "32px",
          }}
        >
          {t("checkout.paymentCancelledHostedBody")}
          {bookingId ? t("checkout.paymentCancelledBookingSaved") : ""}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Link
            href={backHref}
            style={{
              display: "block",
              background: ACCENT,
              color: "#fff",
              borderRadius: "8px",
              padding: "14px 24px",
              fontSize: "15px",
              fontWeight: 600,
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            {backLabel}
          </Link>

          <Link
            href="/"
            style={{
              display: "block",
              background: "transparent",
              color: TEXT_SECONDARY,
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "14px",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            {t("checkout.cancelledGoHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutCancelledPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#F3F4F6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ color: TEXT_SECONDARY }}>{t("checkout.cancelledLoading")}</p>
        </div>
      }
    >
      <>
        <NativeAppCheckoutBounce />
        <CancelledContent />
      </>
    </Suspense>
  );
}

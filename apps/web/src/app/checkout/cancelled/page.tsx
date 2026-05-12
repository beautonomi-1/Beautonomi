"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { XCircle } from "lucide-react";

const ACCENT = "var(--primary, #FF0077)";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6B7280";

function CancelledContent() {
  const params = useSearchParams();
  const bookingId = params.get("booking_id");
  const paymentType = params.get("payment_type");
  const offerId = params.get("offer_id");

  let backHref = "/";
  let backLabel = "Go home";

  if (paymentType === "custom_offer" && offerId) {
    backHref = `/offers/${encodeURIComponent(offerId)}`;
    backLabel = "Back to offer";
  } else if (bookingId) {
    backHref = `/book/continue?booking_id=${encodeURIComponent(bookingId)}`;
    backLabel = "Return to booking";
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
          Payment cancelled
        </h1>
        <p
          style={{
            fontSize: "16px",
            color: TEXT_SECONDARY,
            lineHeight: "1.6",
            marginBottom: "32px",
          }}
        >
          You cancelled the payment. No charge was made.
          {bookingId
            ? " Your booking is still saved — you can continue payment whenever you're ready."
            : ""}
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
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutCancelledPage() {
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
          <p style={{ color: TEXT_SECONDARY }}>Loading…</p>
        </div>
      }
    >
      <CancelledContent />
    </Suspense>
  );
}

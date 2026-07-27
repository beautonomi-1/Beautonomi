"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

type ShareKind = "provider-booking" | "customer-booking" | "customer-order" | "provider-order";

async function runShare(kind: ShareKind, id: string) {
  const mod = await import("@/lib/receipts/share-receipt-client");
  switch (kind) {
    case "provider-booking":
      return mod.shareProviderBookingReceiptWeb(id);
    case "customer-booking":
      return mod.shareCustomerBookingReceiptWeb(id);
    case "customer-order":
      return mod.shareCustomerOrderReceiptWeb(id);
    case "provider-order":
      return mod.shareProviderOrderReceiptWeb(id);
  }
}

export function ShareReceiptButton({
  kind,
  subjectId,
  label = "Share receipt",
  className = "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50",
}: {
  kind: ShareKind;
  subjectId: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy || !subjectId}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await runShare(kind, subjectId);
          if (result === "copied") {
            window.alert("Receipt copied to clipboard.");
          }
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "Could not share receipt.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Share2 className="h-4 w-4" aria-hidden />
      {busy ? "Sharing…" : label}
    </button>
  );
}

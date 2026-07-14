import type { Router } from "expo-router";
import { downloadPdf } from "@/lib/pdf-file";

/**
 * Download a terminal order receipt PDF via the shared platform-native
 * save/preview flow (Bearer first, signed-url fallback).
 */
export async function downloadTerminalOrderReceipt(
  orderId: string,
  router: Router,
  opts?: { productName?: string },
): Promise<void> {
  await downloadPdf({
    router,
    pdfPath: `/api/provider/terminal-orders/${encodeURIComponent(orderId)}/receipt/pdf`,
    signedUrlPath: `/api/provider/terminal-orders/${encodeURIComponent(orderId)}/receipt/signed-url`,
    filename: `terminal_order_${orderId}.pdf`,
    title: "Receipt",
    label: opts?.productName ?? "receipt",
  });
}

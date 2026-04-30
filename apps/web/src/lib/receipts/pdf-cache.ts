/**
 * Wave 2.5 (audit 2026-04 final 100/100): receipt PDF cache.
 *
 * Problem: The receipt PDF endpoint (`/api/bookings/[id]/receipt/pdf` and
 * `/api/provider/bookings/[id]/receipt/pdf`) regenerates the PDF on every
 * single request. For bookings with many services, add-ons, products,
 * additional charges and long receipt headers/footers, that regeneration
 * can approach or exceed the 10-second Vercel serverless timeout on the
 * Hobby tier — customers see a blank download failure on large receipts.
 *
 * Solution: once a booking is finalized (payment_status one of
 * `paid`/`refunded`/`partially_refunded` AND balance_due === 0), the
 * receipt content is immutable. We generate the PDF once, upload it to
 * the existing `receipts` storage bucket, and serve the cached bytes on
 * every subsequent hit — dropping the request cost from hundreds of ms
 * of pdfkit work + DB aggregation down to a single signed download.
 *
 * Non-finalized bookings still render on the fly because their amount
 * paid / balance due is still moving.
 *
 * The object key is deterministic per
 * (bookingId, total_amount, total_paid, wallet_amount, gift_card_amount,
 * total_refunded, payment_status) so if any of those change, the next request writes a new cache
 * entry and stale PDFs are orphaned (not served).
 */
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RECEIPT_BUCKET = "receipts";
const CACHE_PREFIX = "booking-receipts-cache";

export interface ReceiptCacheKeyInput {
  bookingId: string;
  totalAmount: number;
  totalPaid: number;
  walletAmount: number;
  giftCardAmount: number;
  totalRefunded: number;
  paymentStatus: string;
  balanceDue: number;
}

export function isFinalizedForCache(input: ReceiptCacheKeyInput): boolean {
  const status = (input.paymentStatus || "").toLowerCase();
  const settled =
    status === "paid" ||
    status === "refunded" ||
    status === "partially_refunded" ||
    status === "fully_refunded";
  if (!settled) return false;
  if (Math.abs(input.balanceDue) > 0.01) return false;
  return true;
}

export function buildReceiptCacheKey(input: ReceiptCacheKeyInput): string {
  const sig = crypto
    .createHash("sha256")
    .update(
      [
        input.bookingId,
        Math.round((input.totalAmount || 0) * 100),
        Math.round((input.totalPaid || 0) * 100),
        Math.round((input.walletAmount || 0) * 100),
        Math.round((input.giftCardAmount || 0) * 100),
        Math.round((input.totalRefunded || 0) * 100),
        (input.paymentStatus || "").toLowerCase(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
  return `${CACHE_PREFIX}/${input.bookingId}/${sig}.pdf`;
}

export interface CachedReceipt {
  buffer: Buffer;
}

/**
 * Fetch cached PDF bytes if present. Returns `null` on any miss / error;
 * the caller must fall back to fresh generation so a storage outage
 * never blocks the download.
 */
export async function loadCachedReceiptPdf(
  objectKey: string,
): Promise<CachedReceipt | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage.from(RECEIPT_BUCKET).download(objectKey);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength < 200) {
      // Guard: a truncated upload would render a corrupt PDF for every
      // future request. Treat anything absurdly small as a cache miss.
      return null;
    }
    return { buffer };
  } catch {
    return null;
  }
}

/**
 * Persist a freshly generated PDF to the cache bucket. Non-fatal — if
 * the upload fails we silently accept the next cold request.
 */
export async function saveCachedReceiptPdf(
  objectKey: string,
  pdfBuffer: Buffer,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.storage.from(RECEIPT_BUCKET).upload(objectKey, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "31536000, immutable",
    });
  } catch {
    // best-effort cache write
  }
}

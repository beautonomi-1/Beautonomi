import { providerPortalFetch } from "@/lib/http/fetcher";

/**
 * Open or download a provider billing receipt/invoice URL from the portal.
 * Uses credentialed fetch (cookies + Bearer) so `/download` and `/pdf` routes work.
 */
export async function openProviderBillingReceipt(
  invoiceUrl: string,
  options?: { filename?: string },
): Promise<void> {
  const path = invoiceUrl.trim();
  if (!path) return;

  const needsAuthFetch =
    /\/pdf$/.test(path) || /^\/api\/provider\/invoices\/[^/]+\/download$/.test(path);

  if (!needsAuthFetch) {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }

  const response = await providerPortalFetch(path, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Receipt download failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const pdfWindow = window.open(objectUrl, "_blank");
  if (!pdfWindow) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = options?.filename ?? "receipt.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

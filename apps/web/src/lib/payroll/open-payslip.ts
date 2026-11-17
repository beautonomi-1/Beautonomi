import { providerPortalFetch } from "@/lib/http/fetcher";

async function openHtmlBlob(response: Response, filename: string): Promise<void> {
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const popup = window.open(objectUrl, "_blank");
  if (!popup) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Open a payslip after the pay run is approved. Uses the portal session. */
export async function openPayRunPayslip(itemId: string): Promise<void> {
  const response = await providerPortalFetch(`/api/provider/pay-runs/items/${itemId}/payslip`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("PAYSLIP_UNAVAILABLE");
  }
  await openHtmlBlob(response, `payslip-${itemId.slice(0, 8)}.html`);
}

/** Download the EMP201-style CSV after the pay run is approved. */
export async function downloadPayRunEmp201(payRunId: string, periodLabel: string): Promise<void> {
  const response = await providerPortalFetch(`/api/provider/pay-runs/${payRunId}/export/emp201`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("EMP201_UNAVAILABLE");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `emp201-${periodLabel}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

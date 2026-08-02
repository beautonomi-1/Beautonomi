import { paycloudApi, type PaycloudPayment } from "@/lib/provider-portal/paycloud-api";

export const PAYCLOUD_POLL_INTERVAL_MS = 3000;
export const PAYCLOUD_POLL_TIMEOUT_MS = 2 * 60 * 1000;

export function isPaycloudPaymentTerminal(
  status: PaycloudPayment["status"],
): boolean {
  return status === "successful" || status === "failed" || status === "cancelled" || status === "closed";
}

export async function pollPaycloudPaymentUntilSettled(
  paymentId: string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<PaycloudPayment> {
  const intervalMs = options?.intervalMs ?? PAYCLOUD_POLL_INTERVAL_MS;
  const deadline = Date.now() + (options?.timeoutMs ?? PAYCLOUD_POLL_TIMEOUT_MS);
  let last: PaycloudPayment | null = null;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new Error("Polling cancelled");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    if (options?.signal?.aborted) {
      throw new Error("Polling cancelled");
    }
    try {
      last = await paycloudApi.getPayment(paymentId);
      if (isPaycloudPaymentTerminal(last.status)) {
        return last;
      }
    } catch {
      /* keep polling */
    }
  }

  if (last) return last;
  throw new Error("POLL_TIMEOUT");
}

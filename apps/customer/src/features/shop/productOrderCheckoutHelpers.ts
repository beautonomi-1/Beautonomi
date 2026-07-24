import { api } from "@/lib/api-client";
import { getApiErrorCode, isTransientApiFailure } from "@/lib/api-error";
import type { ProductOrder } from "@/features/shop/useProductOrders";

export type CreateOrderApiError = {
  message: string;
  code?: string;
};

export function createProductOrderIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isCreateOrderTransientError(error: CreateOrderApiError | null | undefined): boolean {
  if (!error) return false;
  return isTransientApiFailure({ message: error.message, code: error.code });
}

export async function pollProductOrderPaid(
  fetchOrderDetail: (orderId: string) => Promise<{ data: ProductOrder | null; error: string | null }>,
  orderId: string,
  opts?: { maxAttempts?: number; intervalMs?: number },
): Promise<boolean> {
  const maxAttempts = opts?.maxAttempts ?? 10;
  const intervalMs = opts?.intervalMs ?? 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const check = await fetchOrderDetail(orderId);
    if (check.data?.payment_status === "paid") return true;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

/** After a transient create failure, look for a very recent order for this provider. */
export async function recoverRecentProductOrderForProvider(
  providerId: string,
  maxAgeMs = 5 * 60 * 1000,
): Promise<ProductOrder | null> {
  const res = await api.get<{ orders: ProductOrder[] }>("/api/me/orders?limit=10");
  if (res.error || !res.data?.orders?.length) return null;
  const cutoff = Date.now() - maxAgeMs;
  return (
    res.data.orders.find(
      (o) =>
        o.provider?.id === providerId &&
        new Date(o.created_at).getTime() >= cutoff &&
        o.payment_status !== "failed" &&
        o.status !== "cancelled",
    ) ?? null
  );
}

export function toCreateOrderApiError(error: unknown, fallback: string): CreateOrderApiError {
  if (error != null && typeof error === "object" && "message" in error) {
    const o = error as { message?: string; code?: string };
    return {
      message: typeof o.message === "string" && o.message.trim() ? o.message.trim() : fallback,
      code: getApiErrorCode(error),
    };
  }
  return { message: fallback };
}

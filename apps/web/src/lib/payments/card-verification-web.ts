import { fetcher } from "@/lib/http/fetcher";

export { paystackReferenceFromSearchParams } from "@/lib/payments/paystack-return-reference";

export async function startWebCardVerification(options: {
  setAsDefault: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetcher.post<{
    data?: { authorization_url?: string };
    error?: { message?: string };
  }>("/api/me/payment-methods/initialize-verification", {
    set_as_default: options.setAsDefault,
  });
  const url = res?.data?.authorization_url;
  if (!url) {
    return {
      ok: false,
      message: res?.error?.message ?? "Could not start card verification",
    };
  }
  window.location.assign(url);
  return { ok: true };
}

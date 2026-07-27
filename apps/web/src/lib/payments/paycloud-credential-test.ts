import type { PaycloudApiResponse } from "@/lib/payments/paycloud-client";

/** True when executePaycloudRequest synthesized a failure from HTTP status (empty raw envelope). */
export function isSynthesizedPaycloudHttpError(response: PaycloudApiResponse): boolean {
  if (Object.keys(response.raw).length > 0) return false;
  const code = response.response_code;
  if (!code || !/^\d{3}$/.test(code)) return false;
  const status = Number(code);
  return status >= 400;
}

/**
 * The gateway rejected our credentials rather than the probe order. A signature or app_id
 * error means the keys are wrong, so the test must fail even though the gateway replied.
 */
export function isPaycloudCredentialRejection(response: PaycloudApiResponse): boolean {
  if (response.success) return false;
  const message = response.error_message ?? "";
  return /sign|signat|verif|app[_ ]?id|unauthor|not\s*authoriz|invalid\s*(app|key|merchant\s*app)/i.test(
    message,
  );
}

/** Gateway is reachable when PayCloud returned a parseable signed envelope, not a transport error. */
export function isPaycloudGatewayReachable(response: PaycloudApiResponse): boolean {
  if (isSynthesizedPaycloudHttpError(response)) return false;
  return Object.keys(response.raw).length > 0;
}

/** Overall verdict for the admin "Test credentials" button. */
export function isPaycloudCredentialTestPassing(response: PaycloudApiResponse): boolean {
  if (!isPaycloudGatewayReachable(response)) return false;
  return !isPaycloudCredentialRejection(response);
}

export function formatPaycloudCredentialTestMessage(
  response: PaycloudApiResponse,
  gatewayUrl: string,
): string {
  if (isSynthesizedPaycloudHttpError(response)) {
    const status = response.response_code ?? "unknown";
    return `Could not reach PayCloud gateway (HTTP ${status}) at ${gatewayUrl}. Check API base URL, network, and firewall rules.`;
  }
  if (Object.keys(response.raw).length === 0) {
    return `Could not reach PayCloud gateway at ${gatewayUrl}.`;
  }
  if (isPaycloudCredentialRejection(response)) {
    return `PayCloud rejected these credentials: ${response.error_message}. Check the app ID and both RSA keys.`;
  }
  if (response.success) {
    return "Gateway responded successfully — credentials accepted.";
  }
  const detail = response.error_message?.trim();
  return detail
    ? `Credentials accepted — the probe order was not found, as expected (gateway said: ${detail}).`
    : "Credentials accepted — the probe order was not found, as expected.";
}

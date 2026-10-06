import { createHash } from "crypto";

type AuthMetricName =
  | "auth_rate_limited"
  | "auth_sign_in_rate_limited"
  | "auth_otp_verify_rate_limited"
  | "auth_captcha_required";

export function hashIpForLog(ip: string): string {
  const salt = process.env.AUTH_METRIC_SALT?.trim() || "beautonomi-auth-metric";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

export function logAuthMetric(
  metric: AuthMetricName,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  try {
    console.info(
      JSON.stringify({
        metric,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  } catch {
    // ignore
  }
}

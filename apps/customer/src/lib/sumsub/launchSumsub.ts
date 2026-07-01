/**
 * Customer-side Sumsub native SDK launcher.
 *
 * Fetches a fresh access token from the customer's token endpoint, then
 * launches the @sumsub/react-native-mobilesdk-module native SDK flow.
 * Token expiration mid-flow is handled transparently by re-calling the
 * same endpoint.
 *
 * Usage:
 *   const result = await launchSumsub({ env, onStatusChanged });
 */
import SNSMobileSDK from "@sumsub/react-native-mobilesdk-module";
import { api } from "@/lib/api-client";

export type SumsubStatus =
  | "Approved"
  | "ActionCompleted"
  | "Failed"
  | "Initial"
  | "Incomplete"
  | "Pending"
  | "Ready"
  | "TemporarilyDeclined"
  | "FinallyRejected";

export interface LaunchSumsubOptions {
  env: string;
  /** Called each time the SDK reports a status transition. */
  onStatusChanged?: (status: SumsubStatus) => void;
  /** Called on every Sumsub SDK log entry — useful in dev; skip in production. */
  onLog?: (level: string, message: string) => void;
  /** BCP-47 locale string (e.g. "en-US"). Defaults to device locale. */
  locale?: string;
}

export interface LaunchSumsubResult {
  /** Whether the launch call completed without throwing. */
  ok: boolean;
  /** The last status emitted by the SDK (if any). */
  lastStatus?: SumsubStatus;
  error?: string;
}

async function fetchCustomerToken(env: string): Promise<string> {
  const res = await api.get<{ access_token: string }>(
    `/api/me/verification/sumsub/token?environment=${encodeURIComponent(env)}`,
  );
  const token = res.data?.access_token;
  if (!token) throw new Error("Sumsub customer token endpoint returned no access_token");
  return token;
}

export async function launchSumsub(options: LaunchSumsubOptions): Promise<LaunchSumsubResult> {
  const { env, onStatusChanged, onLog, locale } = options;
  let lastStatus: SumsubStatus | undefined;

  try {
    const initialToken = await fetchCustomerToken(env);

    const tokenExpirationHandler = async (): Promise<string> => {
      try {
        return await fetchCustomerToken(env);
      } catch (e) {
        console.error("[launchSumsub] Token refresh failed", e);
        return "";
      }
    };

    const statusChangedHandler = (newStatus: string, _prevStatus?: string): void => {
      lastStatus = newStatus as SumsubStatus;
      onStatusChanged?.(newStatus as SumsubStatus);
    };

    let sdkBuilder = SNSMobileSDK.init(initialToken, tokenExpirationHandler)
      .withHandlers({
        onStatusChanged: statusChangedHandler,
        ...(onLog ? { onLog } : {}),
      });

    if (locale) {
      sdkBuilder = sdkBuilder.withLocale(locale);
    }

    const sdk = sdkBuilder.build();
    await sdk.launch();

    return { ok: true, lastStatus };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[launchSumsub] customer SDK launch failed:", msg);
    return { ok: false, lastStatus, error: msg };
  }
}

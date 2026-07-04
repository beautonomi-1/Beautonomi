/**
 * Customer-side Didit launcher.
 *
 * Strategy (in order):
 *   1. Try @didit-protocol/sdk-react-native native SDK
 *   2. Fall back to expo-web-browser  (in-app browser tab)
 *
 * SDK result is OPTIMISTIC UI only. Authoritative gate-unlock comes from the webhook.
 */

import * as WebBrowser from "expo-web-browser";
import { api } from "@/lib/api-client";

/**
 * Minimal shape of the native SDK we depend on. Matches
 * @didit-protocol/sdk-react-native v4:
 *   startVerification(token, config?) => Promise<VerificationResult>
 *   VerificationResult.type = 'completed' | 'cancelled' | 'failed'
 *   result.session?.status = 'Approved' | 'Pending' | 'Declined'
 */
type DiditVerificationResult = {
  type: "completed" | "cancelled" | "failed";
  session?: { sessionId: string; status: "Approved" | "Pending" | "Declined" };
  error?: { type: string; message: string };
};

type DiditSDKModule = {
  startVerification: (
    token: string,
    config?: { languageCode?: string; loggingEnabled?: boolean },
  ) => Promise<DiditVerificationResult>;
};

function getDiditNativeSDK(): DiditSDKModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@didit-protocol/sdk-react-native") as Partial<DiditSDKModule>;
    // Native module is only present in a development/production build (not Expo Go).
    return typeof mod?.startVerification === "function" ? (mod as DiditSDKModule) : null;
  } catch {
    return null;
  }
}

export type NormalizedVerificationStatus =
  | "not_started"
  | "session_created"
  | "in_progress"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "abandoned"
  | "requires_retry"
  | "errored";

export interface LaunchDiditOptions {
  persona: "customer" | "provider";
  languageCode?: string;
  returnTo?: string;
  confirmedLegalDetails?: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    country: string;
    nationality?: string;
  };
}

export interface LaunchDiditResult {
  ok: boolean;
  sdkResult?: "completed" | "cancelled";
  error?: string;
}

export async function launchDidit(
  options: LaunchDiditOptions,
): Promise<LaunchDiditResult> {
  const { persona, languageCode, returnTo, confirmedLegalDetails } = options;
  const sessionEndpoint =
    persona === "provider"
      ? "/api/provider/identity-verification/session"
      : "/api/me/identity-verification/session";

  try {
    const res = await api.post<{
      session_token?: string;
      url?: string;
      is_existing?: boolean;
    }>(sessionEndpoint, {
      language_code: languageCode ?? "en",
      return_to: returnTo,
      ...(confirmedLegalDetails
        ? {
            confirmed_legal_details: {
              first_name: confirmedLegalDetails.firstName,
              last_name: confirmedLegalDetails.lastName,
              date_of_birth: confirmedLegalDetails.dateOfBirth,
              country: confirmedLegalDetails.country,
              nationality: confirmedLegalDetails.nationality,
            },
          }
        : {}),
    });

    if (res.error) {
      if (res.error.status === 409) return { ok: true, sdkResult: "completed" };
      return {
        ok: false,
        error: res.error.message ?? "Failed to create verification session",
      };
    }

    const { session_token: sessionToken, url: sessionUrl } = res.data ?? {};

    // Native SDK path (in-process native camera + liveness). Present only in a
    // dev/production build; absent in Expo Go.
    const nativeSdk = getDiditNativeSDK();
    if (nativeSdk && sessionToken) {
      const result = await nativeSdk.startVerification(sessionToken, {
        languageCode: languageCode ?? "en",
      });
      switch (result.type) {
        case "completed":
          return { ok: true, sdkResult: "completed" };
        case "cancelled":
          return { ok: true, sdkResult: "cancelled" };
        case "failed":
        default:
          return {
            ok: false,
            error: result.error?.message ?? "Verification failed. Please try again.",
          };
      }
    }

    // WebBrowser fallback
    const urlToOpen = sessionUrl ?? null;
    if (!urlToOpen) {
      return {
        ok: false,
        error: "Didit SDK unavailable and no session URL returned. Please update the app.",
      };
    }

    const browserResult = await WebBrowser.openBrowserAsync(urlToOpen, {
      dismissButtonStyle: "close",
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    });

    const sdkResult: "completed" | "cancelled" =
      browserResult.type === "cancel" ? "cancelled" : "completed";

    return { ok: true, sdkResult };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[launchDidit] launch failed:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Provider-side Didit launcher.
 *
 * Strategy (in order):
 *   1. Try @didit-protocol/sdk-react-native native SDK (ideal: in-process camera + liveness)
 *   2. Fall back to expo-web-browser  (in-app browser tab — works without native rebuild)
 *
 * SDK result is OPTIMISTIC UI only. Authoritative gate-unlock comes from the webhook.
 *
 * Usage:
 *   const result = await launchDidit({ persona: 'provider', legalDetails });
 */

import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { api } from "@/lib/api-client";
import { formatDiditLaunchError } from "@/lib/identity-verification/userFacingDiditErrors";

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
  /** Optimistic: SDK/browser told us. Authoritative state comes from the webhook. */
  sdkResult?: "completed" | "cancelled";
  error?: string;
}

const SESSION_ENDPOINT: Record<LaunchDiditOptions["persona"], string> = {
  customer: "/api/me/identity-verification/session",
  provider: "/api/provider/identity-verification/session",
};

export async function launchDidit(
  options: LaunchDiditOptions,
): Promise<LaunchDiditResult> {
  const { persona, languageCode, returnTo, confirmedLegalDetails } = options;

  try {
    // 1. Create / reuse session
    const res = await api.post<{
      session_token?: string;
      url?: string;
      is_existing?: boolean;
    }>(SESSION_ENDPOINT[persona], {
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
      // 409 = already approved — not an error in practice
      if (res.error.status === 409) return { ok: true, sdkResult: "completed" };
      return {
        ok: false,
        error: formatDiditLaunchError(
          res.error.message ?? "Failed to create verification session",
        ),
      };
    }

    const { session_token: sessionToken, url: sessionUrl } = res.data ?? {};

    // 2a. Native SDK path (ideal — in-process native camera + liveness).
    //     Present only in a dev/production build; absent in Expo Go.
    const nativeSdk = getDiditNativeSDK();
    if (nativeSdk && sessionToken) {
      const result = await nativeSdk.startVerification(sessionToken, {
        languageCode: languageCode ?? "en",
      });
      switch (result.type) {
        case "completed":
          // 'completed' means the flow finished (Approved/Pending/Declined).
          // The webhook remains the authoritative source of truth.
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

    // Browser fallback — iOS uses system Safari for reliable getUserMedia/camera.
    const urlToOpen = sessionUrl ?? null;
    if (!urlToOpen) {
      return {
        ok: false,
        error:
          "Didit SDK unavailable and no session URL returned. Please update the app.",
      };
    }

    if (Platform.OS === "ios") {
      const canOpen = await Linking.canOpenURL(urlToOpen);
      if (!canOpen) {
        return { ok: false, error: "Could not open verification in Safari." };
      }
      await Linking.openURL(urlToOpen);
      return { ok: true, sdkResult: "completed" };
    }

    const browserResult = await WebBrowser.openBrowserAsync(urlToOpen, {
      dismissButtonStyle: "close",
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
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

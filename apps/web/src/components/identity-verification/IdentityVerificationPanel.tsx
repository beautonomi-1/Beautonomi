"use client";

/**
 * IdentityVerificationPanel
 *
 * Provider-neutral identity-verification entry point for web.
 * Orchestrates:
 *   1. Status check on mount (with reconciliation trigger for stale sessions)
 *   2. Confirm-legal-details step (form with inline validation)
 *   3. Didit SDK launch via @didit-protocol/sdk-web modal (redirect fallback)
 *   4. Optimistic polling after SDK return — only shows approved once webhook confirms
 *   5. All 10 normalized status states (3B UX blueprint)
 *
 * Accessibility:
 *   - Status conveyed by icon + text, not color alone
 *   - ARIA live region announces status changes
 *   - Inline field-level validation errors
 */

import { useEffect, useRef } from "react";
import { useIdentityVerification, type UseIdentityVerificationOptions } from "@/hooks/useIdentityVerification";
import { ConfirmLegalDetailsForm } from "./ConfirmLegalDetailsForm";
import { VerificationStatusCard } from "./VerificationStatusCard";

interface Props extends UseIdentityVerificationOptions {
  /** Shows the "you're verifying yourself, not your business" note for providers */
  isProvider?: boolean;
  /** Optional callback when status becomes approved */
  onApproved?: () => void;
}

export function IdentityVerificationPanel({
  persona,
  locale,
  returnTo,
  isProvider = false,
  onApproved,
}: Props) {
  const {
    status, loading, launching, sessionToken, sessionUrl, isExisting,
    legalDetails, setLegalDetails, legalDetailsErrors,
    startVerification, onSdkReturn, retryVerification, refresh, error,
  } = useIdentityVerification({ persona, locale, returnTo });

  const prevStatusRef = useRef(status);

  // Call onApproved once when we transition to approved
  useEffect(() => {
    if (prevStatusRef.current !== "approved" && status === "approved") {
      onApproved?.();
    }
    prevStatusRef.current = status;
  }, [status, onApproved]);

  // Launch Didit SDK when we have a session URL
  useEffect(() => {
    if (!sessionUrl) return;
    void launchDiditSdk(sessionUrl, onSdkReturn, () => {
      // On error, return user to the confirm-legal-details step (not a dead end)
      void refresh();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUrl]);

  // Determine whether to show the confirm-legal-details form
  const showConfirmForm = (status === "not_started" || status === "session_created") && !sessionUrl;
  const showStatus = !showConfirmForm;

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {showConfirmForm ? (
        <div className="space-y-4">
          <VerificationStatusCard
            status={status}
            loading={loading}
            launching={launching}
            isProvider={isProvider}
          />
          <ConfirmLegalDetailsForm
            legalDetails={legalDetails}
            onChange={setLegalDetails}
            errors={legalDetailsErrors}
            onSubmit={startVerification}
            loading={loading || launching}
            isProvider={isProvider}
          />
        </div>
      ) : (
        <VerificationStatusCard
          status={status}
          loading={loading}
          launching={launching}
          isProvider={isProvider}
          onStart={startVerification}
          onContinue={() => {
            if (sessionUrl) {
              void launchDiditSdk(sessionUrl, onSdkReturn, () => void refresh());
            } else {
              void startVerification();
            }
          }}
          onRetry={retryVerification}
        />
      )}
    </div>
  );
}

// ── SDK launcher ──────────────────────────────────────────────────────────────

// Guards against launching the modal twice for the same URL (effect + button).
let activeSdkUrl: string | null = null;

/**
 * Launch the Didit web verification modal via @didit-protocol/sdk-web.
 * The SDK keeps the user on our domain (iframe modal). We set `onComplete`
 * (a property on the shared singleton) BEFORE calling startVerification, then
 * map the discriminated result. If the SDK can't load (bundling/CSP), we fall
 * back to a full redirect to the Didit-hosted URL — a documented method.
 *
 * The webhook remains the source of truth; SDK/redirect return only triggers
 * optimistic polling.
 */
async function launchDiditSdk(
  url: string,
  onComplete: () => void,
  onError: (e: Error) => void,
) {
  if (activeSdkUrl === url) return;
  activeSdkUrl = url;
  try {
    const mod = await import("@didit-protocol/sdk-web");
    const DiditSdk = mod.DiditSdk ?? (mod as { default?: typeof mod.DiditSdk }).default;
    if (!DiditSdk?.shared) throw new Error("Didit web SDK unavailable");
    const sdk = DiditSdk.shared;
    sdk.onComplete = (result) => {
      activeSdkUrl = null;
      if (result.type === "completed" || result.type === "cancelled") {
        // Re-check status; webhook confirms the authoritative decision.
        onComplete();
      } else {
        onError(new Error(result.error?.message ?? "Verification failed"));
      }
    };
    await sdk.startVerification({ url });
    return;
  } catch {
    // SDK could not load — fall back to the hosted redirect flow.
    activeSdkUrl = null;
    window.location.href = url;
  }
}

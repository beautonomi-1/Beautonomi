"use client";

/**
 * useIdentityVerification
 *
 * Shared hook for both customer and provider identity-verification flows.
 * - Polls the status endpoint after SDK completes (optimistic UI, backend truth)
 * - Manages confirm-legal-details step
 * - Never trusts the SDK result to unlock gates
 * - Handles all 10 normalized statuses
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { validateLegalDobParts } from "@beautonomi/utils";
import type { NormalizedVerificationStatus } from "@/lib/identity-verification/types";
import { formatDiditLaunchError } from "@/lib/identity-verification/user-facing-didit-errors";
import { getUserFacingMessage, extractErrorCode } from "@/lib/errors/user-messages";

export type VerificationPersona = "customer" | "provider";

export interface LegalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  nationality?: string;
}

export interface UseIdentityVerificationOptions {
  persona: VerificationPersona;
  locale?: string;
  returnTo?: string;
  pollIntervalMs?: number;
}

export interface UseIdentityVerificationReturn {
  status: NormalizedVerificationStatus | null;
  loading: boolean;
  launching: boolean;
  sessionToken: string | null;
  sessionUrl: string | null;
  isExisting: boolean;
  legalDetails: LegalDetails;
  setLegalDetails: (d: LegalDetails) => void;
  legalDetailsErrors: Partial<Record<keyof LegalDetails, string>>;
  /** Start verification: calls session endpoint, then sets sessionUrl/token */
  startVerification: () => Promise<void>;
  /** Call after SDK returns to begin polling */
  onSdkReturn: () => void;
  /** Create a fresh session (for retry after rejection) */
  retryVerification: () => Promise<void>;
  refresh: () => Promise<void>;
  error: string | null;
}

const STATUS_ENDPOINT: Record<VerificationPersona, string> = {
  customer: "/api/me/identity-verification/status",
  provider: "/api/provider/identity-verification/status",
};
const SESSION_ENDPOINT: Record<VerificationPersona, string> = {
  customer: "/api/me/identity-verification/session",
  provider: "/api/provider/identity-verification/session",
};

function localeToLanguageCode(locale: string | undefined): string {
  // Map platform locales to BCP 47 / ISO 639-1 codes Didit accepts
  if (!locale) return "en";
  const m = locale.match(/^([a-z]{2,3})/i);
  return m ? m[1].toLowerCase() : "en";
}

function validateLegalDetails(d: LegalDetails): Partial<Record<keyof LegalDetails, string>> {
  const errors: Partial<Record<keyof LegalDetails, string>> = {};
  if (!d.firstName.trim()) errors.firstName = "Legal first name is required";
  else if (!/^[\p{L}\s\-'.]+$/u.test(d.firstName.trim()))
    errors.firstName = "Enter your name as it appears on your ID";
  if (!d.lastName.trim()) errors.lastName = "Legal last name is required";
  else if (!/^[\p{L}\s\-'.]+$/u.test(d.lastName.trim()))
    errors.lastName = "Enter your name as it appears on your ID";
  if (!d.dateOfBirth) errors.dateOfBirth = "Date of birth is required";
  else {
    const dobError = validateLegalDobParts(
      {
        day: Number(d.dateOfBirth.slice(8, 10)) || null,
        month: Number(d.dateOfBirth.slice(5, 7)) || null,
        year: Number(d.dateOfBirth.slice(0, 4)) || null,
      },
      { minAge: 18 },
    );
    if (dobError) errors.dateOfBirth = dobError;
  }
  if (!d.country) errors.country = "Issuing country is required";
  return errors;
}

export function useIdentityVerification(
  options: UseIdentityVerificationOptions,
): UseIdentityVerificationReturn {
  const { persona, locale, returnTo, pollIntervalMs = 4000 } = options;

  const [status, setStatus] = useState<NormalizedVerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false);
  const [legalDetails, setLegalDetails] = useState<LegalDetails>({
    firstName: "", lastName: "", dateOfBirth: "", country: "",
  });
  const [legalDetailsErrors, setLegalDetailsErrors] = useState<Partial<Record<keyof LegalDetails, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      pollAttemptsRef.current = 0;
    }
  }, []);

  const fetchStatus = useCallback(async (): Promise<NormalizedVerificationStatus> => {
    const res = await fetch(STATUS_ENDPOINT[persona], { credentials: "include" });
    if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
    const json = await res.json() as { status?: NormalizedVerificationStatus };
    return json.status ?? "not_started";
  }, [persona]);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
    } catch {
      // ignore transient errors
    }
  }, [fetchStatus]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setStatus("not_started"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchStatus]);

  // Poll after SDK returns until terminal status (extended window for AML / manual review)
  const onSdkReturn = useCallback(() => {
    const MAX_POLL_ATTEMPTS = 30;
    const MAX_REVIEW_POLL_ATTEMPTS = 90;
    const terminal = new Set([
      "approved", "rejected", "expired", "abandoned", "errored",
    ]);
    const shouldStop = (status: NormalizedVerificationStatus, attempts: number) => {
      if (terminal.has(status)) return true;
      if (status === "pending_review") return attempts >= MAX_REVIEW_POLL_ATTEMPTS;
      return attempts >= MAX_POLL_ATTEMPTS;
    };

    // Show optimistic "checking" — don't unlock gates until webhook confirms
    stopPolling();
    pollAttemptsRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollAttemptsRef.current++;
      try {
        const s = await fetchStatus();
        setStatus(s);
        if (shouldStop(s, pollAttemptsRef.current)) {
          stopPolling();
        }
      } catch {
        if (pollAttemptsRef.current >= MAX_REVIEW_POLL_ATTEMPTS) stopPolling();
      }
    }, pollIntervalMs);
  }, [fetchStatus, pollIntervalMs, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Converge status when the user returns from the Didit hosted flow (redirect
  // path) or re-focuses the tab. Didit appends ?verificationSessionId & ?status
  // to the callback URL; detecting it kicks off polling until the webhook lands.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const returnedFromDidit = params.has("verificationSessionId") || params.has("status");
    if (returnedFromDidit) {
      onSdkReturn();
      params.delete("verificationSessionId");
      params.delete("status");
      const clean = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", clean);
    }
    const onVisible = () => { void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVerification = useCallback(async () => {
    const validationErrors = validateLegalDetails(legalDetails);
    if (Object.keys(validationErrors).length > 0) {
      setLegalDetailsErrors(validationErrors);
      return;
    }
    setLegalDetailsErrors({});
    setError(null);
    setLaunching(true);
    try {
      const res = await fetch(SESSION_ENDPOINT[persona], {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_code: localeToLanguageCode(locale),
          return_to: returnTo,
          confirmed_legal_details: {
            first_name:   legalDetails.firstName,
            last_name:    legalDetails.lastName,
            date_of_birth:legalDetails.dateOfBirth,
            country:      legalDetails.country,
            nationality:  legalDetails.nationality,
          },
        }),
      });
      if (res.status === 409) {
        // Already approved
        const s = await fetchStatus();
        setStatus(s);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as {
          message?: string;
          error?: { message?: string; code?: string } | null;
        };
        const code = extractErrorCode(json) ?? json.error?.code;
        const raw =
          json.error?.message ?? json.message ?? "Failed to start verification";
        // Prefer Didit-specific copy; avoid booking's PROVIDER_UNAVAILABLE message.
        const safe = formatDiditLaunchError(raw);
        throw new Error(
          code === "DIDIT_SESSION_CREATE_FAILED"
            ? getUserFacingMessage(code, safe)
            : safe,
        );
      }
      const data = await res.json() as {
        session_token?: string; url?: string; is_existing?: boolean;
      };
      setSessionToken(data.session_token ?? null);
      setSessionUrl(data.url ?? null);
      setIsExisting(data.is_existing ?? false);
    } catch (err) {
      setError(
        formatDiditLaunchError(
          err instanceof Error ? err.message : null,
        ),
      );
    } finally {
      setLaunching(false);
    }
  }, [legalDetails, persona, locale, returnTo, fetchStatus]);

  const retryVerification = useCallback(async () => {
    // Reset session so user can restart with fresh session
    setSessionToken(null);
    setSessionUrl(null);
    setStatus("not_started");
    setError(null);
  }, []);

  return {
    status, loading, launching, sessionToken, sessionUrl, isExisting,
    legalDetails, setLegalDetails, legalDetailsErrors,
    startVerification, onSdkReturn, retryVerification, refresh, error,
  };
}

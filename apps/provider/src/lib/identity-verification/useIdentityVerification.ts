/**
 * useIdentityVerification (React Native / Expo)
 *
 * Shared hook for provider and customer verification flows on mobile.
 * - Polls status endpoint after SDK returns (webhook-confirmed, not SDK result)
 * - Manages confirm-legal-details state + validation
 * - Never unlocks gates based on SDK result — always waits for server confirmation
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { validateLegalDobParts, parseLegalDobIso } from "@beautonomi/utils";
import { api } from "@/lib/api-client";

export type NormalizedVerificationStatus =
  | "not_started" | "session_created" | "in_progress" | "pending_review"
  | "approved" | "rejected" | "expired" | "abandoned" | "requires_retry" | "errored";

export interface LegalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  nationality?: string;
}

export interface LegalDetailsErrors {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  country?: string;
}

function validateLegalDetails(d: LegalDetails): LegalDetailsErrors {
  const errors: LegalDetailsErrors = {};
  if (!d.firstName.trim()) errors.firstName = "Legal first name is required";
  if (!d.lastName.trim()) errors.lastName = "Legal last name is required";
  if (!d.dateOfBirth) errors.dateOfBirth = "Date of birth is required";
  else {
    const dobError = validateLegalDobParts(parseLegalDobIso(d.dateOfBirth), { minAge: 18 });
    if (dobError) errors.dateOfBirth = dobError;
  }
  if (!d.country) errors.country = "Issuing country is required";
  return errors;
}

const TERMINAL_STATUSES = new Set<NormalizedVerificationStatus>([
  "approved", "rejected", "expired", "abandoned", "errored",
]);

const MAX_POLL_ATTEMPTS = 30;
const MAX_REVIEW_POLL_ATTEMPTS = 90;

function shouldStopPolling(
  status: NormalizedVerificationStatus,
  attempts: number,
): boolean {
  if (TERMINAL_STATUSES.has(status)) return true;
  if (status === "pending_review") return attempts >= MAX_REVIEW_POLL_ATTEMPTS;
  return attempts >= MAX_POLL_ATTEMPTS;
}

const STATUS_ENDPOINT: Record<"customer" | "provider", string> = {
  customer: "/api/me/identity-verification/status",
  provider: "/api/provider/identity-verification/status",
};

export interface UseIdentityVerificationReturn {
  status: NormalizedVerificationStatus | null;
  loading: boolean;
  legalDetails: LegalDetails;
  legalDetailsErrors: LegalDetailsErrors;
  setLegalDetails: (d: LegalDetails) => void;
  validateAndGetErrors: () => LegalDetailsErrors;
  startPolling: () => void;
  stopPolling: () => void;
  refresh: () => Promise<void>;
}

export function useIdentityVerification(
  persona: "customer" | "provider",
  pollIntervalMs = 4000,
): UseIdentityVerificationReturn {
  const [status, setStatus] = useState<NormalizedVerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalDetails, setLegalDetails] = useState<LegalDetails>({
    firstName: "", lastName: "", dateOfBirth: "", country: "",
  });
  const [legalDetailsErrors, setLegalDetailsErrors] = useState<LegalDetailsErrors>({});

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  const fetchStatus = useCallback(async (): Promise<NormalizedVerificationStatus> => {
    const res = await api.get<{ status?: NormalizedVerificationStatus }>(STATUS_ENDPOINT[persona]);
    return res.data?.status ?? "not_started";
  }, [persona]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      pollAttemptsRef.current = 0;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
    } catch {
      // ignore
    }
  }, [fetchStatus]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollAttemptsRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollAttemptsRef.current++;
      try {
        const s = await fetchStatus();
        setStatus(s);
        if (shouldStopPolling(s, pollAttemptsRef.current)) {
          stopPolling();
        }
      } catch {
        if (pollAttemptsRef.current >= MAX_REVIEW_POLL_ATTEMPTS) stopPolling();
      }
    }, pollIntervalMs);
  }, [fetchStatus, pollIntervalMs, stopPolling]);

  useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setStatus("not_started"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; stopPolling(); };
  }, [fetchStatus, stopPolling]);

  const validateAndGetErrors = useCallback((): LegalDetailsErrors => {
    const errors = validateLegalDetails(legalDetails);
    setLegalDetailsErrors(errors);
    return errors;
  }, [legalDetails]);

  return {
    status, loading, legalDetails, legalDetailsErrors,
    setLegalDetails, validateAndGetErrors, startPolling, stopPolling, refresh,
  };
}

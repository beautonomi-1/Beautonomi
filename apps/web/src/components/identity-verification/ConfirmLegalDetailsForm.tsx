"use client";

/**
 * ConfirmLegalDetailsForm
 *
 * Pre-verification step that asks the user to confirm their legal details
 * exactly as they appear on their government ID or passport.
 */

import { type ChangeEvent } from "react";
import type { LegalDetails } from "@/hooks/useIdentityVerification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, AlertCircle } from "lucide-react";
import { LegalDobPicker } from "./LegalDobPicker";
import { LegalCountryCombobox } from "./LegalCountryCombobox";

interface Props {
  legalDetails: LegalDetails;
  onChange: (d: LegalDetails) => void;
  errors: Partial<Record<keyof LegalDetails, string>>;
  onSubmit: () => void;
  loading: boolean;
  isProvider?: boolean;
}

export function ConfirmLegalDetailsForm({
  legalDetails,
  onChange,
  errors,
  onSubmit,
  loading,
  isProvider = false,
}: Props) {
  function update(field: keyof LegalDetails) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...legalDetails, [field]: e.target.value });
    };
  }

  return (
    <div className="space-y-5" role="form" aria-label="Confirm legal details before verification">
      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <AlertDescription className="text-sm leading-snug">
          <strong>Important:</strong> Enter your details exactly as they appear on your government
          ID or passport — including middle names and accents. Nicknames or mismatched details will
          cause verification to fail.
        </AlertDescription>
      </Alert>

      {isProvider && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-900">
          <InfoIcon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <AlertDescription className="text-sm leading-snug">
            You&apos;re verifying <strong>your own identity</strong> as the owner or authorized
            representative. If your salon is a registered business, your payout account can be in
            the business name — that&apos;s expected and won&apos;t cause an issue.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="legal-first-name">
            Legal first name <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input
            id="legal-first-name"
            value={legalDetails.firstName}
            onChange={update("firstName")}
            placeholder="As on your ID / passport"
            autoComplete="given-name"
            aria-required="true"
            aria-describedby={errors.firstName ? "err-first-name" : undefined}
            className={errors.firstName ? "border-destructive" : ""}
          />
          {errors.firstName && (
            <p id="err-first-name" className="text-xs text-destructive" role="alert">
              {errors.firstName}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="legal-last-name">
            Legal last name <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input
            id="legal-last-name"
            value={legalDetails.lastName}
            onChange={update("lastName")}
            placeholder="As on your ID / passport"
            autoComplete="family-name"
            aria-required="true"
            aria-describedby={errors.lastName ? "err-last-name" : undefined}
            className={errors.lastName ? "border-destructive" : ""}
          />
          {errors.lastName && (
            <p id="err-last-name" className="text-xs text-destructive" role="alert">
              {errors.lastName}
            </p>
          )}
        </div>

        <LegalDobPicker
          value={legalDetails.dateOfBirth}
          onChange={(dateOfBirth) => onChange({ ...legalDetails, dateOfBirth })}
          error={errors.dateOfBirth}
        />

        <LegalCountryCombobox
          value={legalDetails.country}
          onChange={(country) => onChange({ ...legalDetails, country })}
          error={errors.country}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Fields marked <span className="text-destructive" aria-hidden="true">*</span> are required.
        Your legal details are used only to cross-check your document during verification.
      </p>

      <Button
        onClick={onSubmit}
        disabled={loading}
        className="w-full"
        aria-label="Start identity verification"
      >
        {loading ? "Starting…" : "Start verification"}
      </Button>
    </div>
  );
}

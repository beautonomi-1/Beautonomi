"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Loader2, Upload, FileText, CheckCircle } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { CountryOfIssueSelect } from "@/components/verification/CountryOfIssueSelect";
import { IdentityVerificationPanel } from "@/components/identity-verification/IdentityVerificationPanel";
import {
  canSkipProviderVerification,
  providerVerificationOnboardingBanner,
  verificationRequiredForProviders,
} from "@/lib/verification/provider-verification-ui";

type LegacyVerificationStatus = "pending" | "in_progress" | "approved" | "rejected" | "reset";

interface StatusResponse {
  status: LegacyVerificationStatus;
  didit_available?: boolean;
  sumsub_available?: boolean;
  manual_available?: boolean;
  verification_mode?: string;
  rejection_reason?: string | null;
  required_for_providers?: boolean;
  manual_verification?: {
    id: string;
    status: string;
    document_type: string;
    submitted_at: string;
    rejection_reason?: string | null;
  } | null;
}

const DOC_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "Identity card" },
];

export default function VerificationPage() {
  const { bundle } = useConfigBundle();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Manual upload state
  const [docType, setDocType] = useState("license");
  const [country, setCountry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const env = bundle?.meta?.env ?? "production";

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: StatusResponse }>(
        `/api/provider/verification/status?environment=${encodeURIComponent(env)}`,
      );
      setStatusData(res.data ?? null);
    } catch {
      setStatusData(null);
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Reload when the provider returns to the tab (e.g. after returning from the
  // Didit hosted flow or an admin review) so status reflects without a refresh.
  useEffect(() => {
    const onFocus = () => {
      void loadStatus();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadStatus]);

  const status = statusData?.status ?? "pending";
  const diditAvailable = statusData?.didit_available ?? false;
  const manualAvailable = statusData?.manual_available !== false;
  const verificationOff = statusData?.verification_mode === "off";

  const isApproved = status === "approved";
  const isUnderReview = status === "in_progress" || statusData?.manual_verification?.status === "pending";
  const verificationRequired =
    statusData?.required_for_providers ??
    verificationRequiredForProviders(bundle?.verification);
  const canSkip = canSkipProviderVerification({ required: verificationRequired, status });

  const goToDashboard = () => {
    if (!canSkip) {
      toast.error(
        "Identity verification is required before you can go live. Complete verification to earn your Verified trust badge.",
      );
      return;
    }
    router.push("/provider/dashboard");
  };

  // ─── Manual upload ────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const submitManual = async () => {
    if (!file || !country) {
      toast.error("Please select a document photo and choose the country of issue.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("document_type", docType);
      form.append("country", country);

      const res = await fetcher.post<{ data: { status: string } }>("/api/me/verification", form);
      if ((res as { error?: { message?: string } }).error) {
        toast.error((res as { error?: { message?: string } }).error?.message ?? "Upload failed. Please try again.");
        return;
      }
      toast.success("Document submitted. Our team will review it within a few business days.");
      setFile(null);
      setCountry("");
      loadStatus();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <SettingsDetailLayout title="Identity verification" subtitle="Verify your identity for compliance.">
        <LoadingTimeout loadingMessage="Loading..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Identity verification" subtitle="Verify your identity for compliance and payouts.">
      {isOnboarding && (
        <SectionCard title={verificationRequired ? "One more step to go live" : "You're almost done"} className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {providerVerificationOnboardingBanner(verificationRequired)}
            </p>
            {canSkip ? (
              <Button variant="outline" className="shrink-0" onClick={goToDashboard}>
                {isApproved || isUnderReview ? "Continue to dashboard" : "Skip for now"}
              </Button>
            ) : null}
          </div>
        </SectionCard>
      )}

      {/* Didit automated verification (primary flow) */}
      {diditAvailable && (
        <SectionCard title="Verification status">
          <IdentityVerificationPanel
            persona="provider"
            isProvider
            returnTo={typeof window !== "undefined" ? window.location.pathname : "/provider/settings/verification"}
            onApproved={() => void loadStatus()}
          />
        </SectionCard>
      )}

      {/* Verification off — no paths available */}
      {verificationOff && !isApproved && (
        <SectionCard title="Verification status">
          <Alert>
            <AlertDescription>
              Identity verification is currently unavailable. Contact support if you need assistance.
            </AlertDescription>
          </Alert>
        </SectionCard>
      )}

      {/* Manual document upload — shown when manual is enabled and not yet approved/under review */}
      {!isApproved && !isUnderReview && !verificationOff && manualAvailable && (
        <SectionCard
          title={diditAvailable ? "Alternative: Manual document upload" : "Upload ID document"}
          className="mt-4"
        >
          {!diditAvailable && (
            <Alert className="mb-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Our automated verification is being set up. In the meantime upload a copy of your ID — our team will review it manually within 1–2 business days.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {/* Document type */}
            <div>
              <label className="block text-sm font-medium mb-2">Document type</label>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDocType(opt.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      docType === opt.value
                        ? "bg-primary text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Country */}
            <div>
              <label htmlFor="country-of-issue" className="block text-sm font-medium mb-1">
                Country of issue
              </label>
              <CountryOfIssueSelect
                id="country-of-issue"
                value={country}
                onChange={setCountry}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium mb-1">Document photo</label>
              <label
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                  file ? "border-primary bg-pink-50" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {file ? (
                  <>
                    <FileText className="h-8 w-8 text-primary" />
                    <span className="text-sm font-medium text-gray-900">{file.name}</span>
                    <span className="text-xs text-primary">Click to change</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-gray-400" />
                    <span className="text-sm text-gray-600">Click to select a photo of your ID</span>
                    <span className="text-xs text-gray-500">JPEG, PNG, WebP or PDF — max 10 MB</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <Button
              onClick={submitManual}
              disabled={uploading || !file || !country.trim()}
              className="w-full bg-primary hover:bg-[#e6006b]"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</> : "Submit for verification"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Your document is stored securely and used only for identity verification.
            </p>
          </div>
        </SectionCard>
      )}

      {/* Why we verify */}
      <SectionCard title="Why we verify" className="mt-4">
        <p className="text-sm text-muted-foreground">
          Identity verification helps prevent fraud and ensures the safety of our community. Your information is stored securely and used only for compliance purposes.
        </p>
      </SectionCard>
    </SettingsDetailLayout>
  );
}

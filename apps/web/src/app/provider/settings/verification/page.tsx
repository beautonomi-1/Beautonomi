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
  ProviderVerificationHub,
  type VerificationHubStatus,
} from "@/components/provider-verification/ProviderVerificationHub";
import {
  canSkipProviderVerification,
  providerVerificationOnboardingBanner,
  verificationRequiredForProviders,
} from "@/lib/verification/provider-verification-ui";

type LegacyVerificationStatus = "pending" | "in_progress" | "approved" | "rejected" | "reset";

interface StatusResponse extends VerificationHubStatus {
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

      {(diditAvailable || manualAvailable) && statusData && (
        <SectionCard title="Verification">
          <ProviderVerificationHub
            statusData={statusData}
            onRefresh={loadStatus}
            manualUploadSection={
              !isApproved && !isUnderReview && manualAvailable ? (
                <div className="space-y-4 pt-2">
                  {!diditAvailable && (
                    <p className="text-sm text-muted-foreground">
                      Upload a clear photo of your government-issued ID. Our team will review it manually.
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Document type</label>
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                      >
                        {DOC_TYPES.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Country of issue</label>
                      <CountryOfIssueSelect value={country} onChange={setCountry} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Document photo</label>
                    <input type="file" accept="image/*" onChange={handleFileChange} />
                  </div>
                  <Button onClick={submitManual} disabled={uploading || !file || !country}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Submit for review
                      </>
                    )}
                  </Button>
                </div>
              ) : undefined
            }
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

      {/* Why we verify */}
      <SectionCard title="Why we verify" className="mt-4">
        <p className="text-sm text-muted-foreground">
          Identity verification helps prevent fraud and ensures the safety of our community. Your information is stored securely and used only for compliance purposes.
        </p>
      </SectionCard>
    </SettingsDetailLayout>
  );
}

"use client";

import { useTranslation } from "@beautonomi/i18n";
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

const DOC_TYPE_VALUES = ["license", "passport", "identity"] as const;

export default function VerificationPage() {
  const { t } = useTranslation();
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
  const planComplete = statusData?.verification_plan?.is_complete === true;
  const canSkip = canSkipProviderVerification({
    required: verificationRequired,
    status,
    planComplete: statusData?.verification_plan ? planComplete : undefined,
  });

  const goToDashboard = () => {
    if (!canSkip) {
      toast.error(
        t("web.provider.settings.pages.verification.requiredToGoLive"),
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
      toast.error(t("web.provider.settings.pages.verification.pleaseSelectADocumentPhotoAnd"));
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
toast.error((res as { error?: { message?: string } }).error?.message ?? t("web.provider.settings.pages.verification.uploadFailedPleaseTryAgain"));
        return;
      }
      toast.success(t("web.provider.settings.pages.verification.documentSubmittedOurTeamWillReview"));
      setFile(null);
      setCountry("");
      loadStatus();
    } catch {
      toast.error(t("web.provider.settings.pages.verification.uploadFailedPleaseTryAgain"));
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <SettingsDetailLayout title={t("web.provider.settings.categories.appointmentActivity.items.verification.title")} subtitle={t("web.provider.settings.categories.appointmentActivity.items.verification.description")}>
        <LoadingTimeout loadingMessage={t("common.loading")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title={t("web.provider.settings.pages.verification.identityVerification")} subtitle={t("web.provider.settings.pages.verification.verifyYourIdentityForComplianceAnd")}>
      {isOnboarding && (
<SectionCard title={verificationRequired ? t("web.provider.settings.pages.verification.oneMoreStep") : t("web.provider.settings.pages.verification.almostDone")} className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {providerVerificationOnboardingBanner(verificationRequired)}
            </p>
            {canSkip ? (
              <Button variant="outline" className="shrink-0" onClick={goToDashboard}>
{isApproved || isUnderReview ? t("web.provider.settings.pages.verification.continueToDashboard") : t("web.provider.settings.pages.verification.skipForNow")}
              </Button>
            ) : null}
          </div>
        </SectionCard>
      )}

      {(diditAvailable || manualAvailable) && statusData && (
        <SectionCard title={t("web.provider.settings.pages.verification.verification")}>
          <ProviderVerificationHub
            statusData={statusData}
            onRefresh={loadStatus}
            manualUploadSection={
              !isApproved && !isUnderReview && manualAvailable ? (
                <div className="space-y-4 pt-2">
                  {!diditAvailable && (
                    <p className="text-sm text-muted-foreground">
{t("web.provider.settings.pages.verification.manualUploadHint")}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
<label className="mb-1 block text-sm font-medium">{t("web.provider.settings.pages.verification.documentType")}</label>
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                      >
{DOC_TYPE_VALUES.map((value) => (
  <option key={value} value={value}>
                            {value === "license" ? t("web.provider.settings.pages.verification.driverSLicense") : value === "passport" ? t("web.provider.settings.pages.verification.passport") : t("web.provider.settings.pages.verification.identityCard")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
<label className="mb-1 block text-sm font-medium">{t("web.provider.settings.pages.verification.countryOfIssue")}</label>
                      <CountryOfIssueSelect value={country} onChange={setCountry} />
                    </div>
                  </div>
                  <div>
<label className="mb-1 block text-sm font-medium">{t("web.provider.settings.pages.verification.documentPhoto")}</label>
                    <input type="file" accept="image/*" onChange={handleFileChange} />
                  </div>
                  <Button onClick={submitManual} disabled={uploading || !file || !country}>
                    {uploading ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
{t("web.provider.settings.pages.verification.uploading")}
                      </>
                    ) : (
                      <>
                        <Upload className="me-2 h-4 w-4" />
{t("web.provider.settings.pages.verification.submitForReview")}
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
        <SectionCard title={t("web.provider.settings.pages.verification.verificationStatus")}>
          <Alert>
            <AlertDescription>
{t("web.provider.settings.pages.verification.unavailable")}
            </AlertDescription>
          </Alert>
        </SectionCard>
      )}

      {/* Why we verify */}
      <SectionCard title={t("web.provider.settings.pages.verification.whyWeVerify")} className="mt-4">
        <p className="text-sm text-muted-foreground">
{t("web.provider.settings.pages.verification.whyBody")}
        </p>
      </SectionCard>
    </SettingsDetailLayout>
  );
}

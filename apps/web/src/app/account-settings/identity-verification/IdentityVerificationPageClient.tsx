"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck } from "lucide-react";
import BackButton from "@/components/ui/back-button";
import Breadcrumb from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetcher } from "@/lib/http/fetcher";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import VerificationStatusCard from "@/components/profile/VerificationStatusCard";
import { CountryOfIssueSelect } from "@/components/verification/CountryOfIssueSelect";
import { formatVerificationCountryDisplay } from "@beautonomi/utils";
import { IdentityVerificationPanel } from "@/components/identity-verification/IdentityVerificationPanel";
import {
  customerVerificationCheckoutBanner,
  customerVerificationSubtitle,
  verificationRequiredForCustomers,
} from "@/lib/verification/customer-verification-ui";

type VerificationSubmission = {
  id: string;
  document_type: string;
  country: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  has_document_file: boolean;
};

type VerificationStatus = {
  verified: boolean;
  status: string;
  can_submit_verification?: boolean;
  sumsub_available: boolean;
  manual_available?: boolean;
  verification_mode?: string;
  required_for_customers?: boolean;
  submissions?: VerificationSubmission[];
};

const DOCUMENT_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "National ID" },
] as const;

// Pass hasSubmissions so we don't show "Under Review" when the user-level
// status is stale ('pending' on the users table) but no actual records exist.
function statusForCard(
  status: string,
  verified: boolean,
  hasSubmissions: boolean,
): "none" | "pending" | "verified" | "failed" {
  if (verified || status === "approved") return "verified";
  if (
    hasSubmissions &&
    (status === "pending" ||
      status === "in_progress" ||
      status === "submitted" ||
      status === "under_review")
  ) {
    return "pending";
  }
  if (status === "rejected") return "failed";
  return "none";
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function IdentityVerificationPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to");
  const { bundle } = useConfigBundle();
  const [data, setData] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [launchingSumsub, setLaunchingSumsub] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<string>("license");
  const [country, setCountry] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetcher.get<{ data: VerificationStatus }>("/api/me/verification", {
        staleTimeMs: silent ? 0 : 15_000,
      });
      setData(res.data);
      setLastRefreshedAt(new Date());
    } catch {
      if (!silent) toast.error("Could not load verification status");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      void load(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const canSubmit = data?.can_submit_verification ?? false;
  const submissions = data?.submissions ?? [];
  const cardStatus = statusForCard(data?.status ?? "none", Boolean(data?.verified), submissions.length > 0);
  const latestRejection = submissions.find((s) => s.rejection_reason)?.rejection_reason;
  const diditAvailable = (data as (VerificationStatus & { didit_available?: boolean }) | null)?.didit_available ?? false;
  const manualAvailable = data?.manual_available !== false; // default true for backwards compat
  const verificationOff = data?.verification_mode === "off";
  const verificationRequired =
    data?.required_for_customers ?? verificationRequiredForCustomers(bundle?.verification);
  const fromCheckout = Boolean(returnTo);
  const showRequiredBanner = verificationRequired && !data?.verified;

  const continueAfterVerify = useCallback(() => {
    if (returnTo && returnTo.startsWith("/")) {
      router.push(returnTo);
      return;
    }
    router.push("/account-settings");
  }, [returnTo, router]);

  useEffect(() => {
    if (data?.verified && returnTo) {
      continueAfterVerify();
    }
  }, [data?.verified, returnTo, continueAfterVerify]);

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !country) {
      toast.error("Select a document and country");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);
      formData.append("country", country);
      await fetcher.post("/api/me/verification", formData);
      toast.success("Document submitted for review");
      setFile(null);
      setCountry("");
      await load(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const viewDocument = async (id: string) => {
    try {
      const res = await fetcher.get<{ data: { signed_url?: string } }>(
        `/api/me/verification/${encodeURIComponent(id)}/view`,
      );
      const url = res.data?.signed_url;
      if (!url) {
        toast.error("Could not open document");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Could not open document");
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <BackButton href="/account-settings" />
      <Breadcrumb
        items={[
          { label: "Account", href: "/account-settings" },
          { label: "Identity verification" },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Identity verification</h1>
          <p className="text-sm text-gray-600 mt-1">
            {customerVerificationSubtitle(verificationRequired)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {fromCheckout && data?.verified ? (
            <Button type="button" className="shrink-0" onClick={continueAfterVerify}>
              Continue booking
            </Button>
          ) : null}
          <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing || loading}
          onClick={() => void load(true)}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh status"}
        </Button>
        </div>
      </div>

      {showRequiredBanner ? (
        <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900">
          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" />
          <AlertDescription className="text-sm">
            {fromCheckout
              ? customerVerificationCheckoutBanner(true)
              : "Identity verification is required before your first booking on this marketplace."}
          </AlertDescription>
        </Alert>
      ) : null}

      {lastRefreshedAt ? (
        <p className="text-xs text-gray-500 mb-4">
          Last updated at{" "}
          {lastRefreshedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </p>
      ) : null}

      {loading ? (
        <p className="text-gray-600">Loading verification status…</p>
      ) : (
        <div className="space-y-6">
          <VerificationStatusCard
            status={cardStatus}
            failureReason={latestRejection ?? undefined}
            onAction={() => {
              document.getElementById("verification-upload")?.scrollIntoView({ behavior: "smooth" });
            }}
          />

          {/* Didit automated verification (primary flow) */}
          {diditAvailable ? (
            <IdentityVerificationPanel
              persona="customer"
              returnTo={typeof window !== "undefined" ? window.location.pathname : "/account-settings/identity-verification"}
              onApproved={() => void load(true)}
            />
          ) : null}

          {verificationOff ? (
            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="p-5">
                <p className="font-medium text-gray-700">Verification not available</p>
                <p className="text-sm text-gray-500 mt-1">
                  Identity verification is currently unavailable. Please contact support if you need assistance.
                </p>
              </CardContent>
            </Card>
          ) : canSubmit && manualAvailable ? (
            <Card id="verification-upload">
              <CardContent className="p-5">
                <h2 className="font-semibold text-gray-900 mb-1">Upload ID manually</h2>
                <p className="text-sm text-gray-600 mb-4">
                  JPEG, PNG, WebP, or PDF up to 10MB. Our team will review your submission.
                </p>
                <form onSubmit={submitManual} className="space-y-4">
                  <div>
                    <Label htmlFor="document_type">Document type</Label>
                    <select
                      id="document_type"
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {DOCUMENT_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="country-of-issue">Country of issue</Label>
                    <CountryOfIssueSelect
                      id="country-of-issue"
                      value={country}
                      onChange={setCountry}
                    />
                  </div>
                  <div>
                    <Label htmlFor="file">Document</Label>
                    <input
                      id="file"
                      type="file"
                      accept="image/*,.pdf"
                      className="mt-1 w-full text-sm"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={uploading} className="bg-primary hover:bg-primary-hover">
                    {uploading ? "Uploading…" : "Submit for verification"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : !data?.verified && submissions.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex gap-3">
                <ShieldCheck className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">
                  You cannot submit a new document while a submission is under review. Refresh status
                  after an admin request, or contact support if you were asked to re-verify.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Submission history</h2>
            {submissions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No submissions yet.</p>
            ) : (
              <ul className="space-y-3">
                {submissions.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 text-sm"
                  >
                    <p className="text-gray-800">
                      {row.document_type} · {formatVerificationCountryDisplay(row.country)} ·{" "}
                      {formatWhen(row.submitted_at)}
                    </p>
                    <p className="text-gray-500 mt-1 capitalize">{row.status.replace(/_/g, " ")}</p>
                    {row.rejection_reason ? (
                      <p className="text-amber-800 mt-2 text-xs">{row.rejection_reason}</p>
                    ) : null}
                    {row.has_document_file ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => void viewDocument(row.id)}
                      >
                        View document
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-sm text-gray-500">
            You can also manage other details on{" "}
            <Link href="/account-settings/personal-info" className="text-primary underline">
              Personal info
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

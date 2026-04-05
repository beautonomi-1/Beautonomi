"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Upload,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";

type VerificationStatus = "pending" | "in_progress" | "approved" | "rejected" | "reset";

interface StatusResponse {
  status: VerificationStatus;
  sumsub_available: boolean;
  sumsub_applicant_id?: string | null;
  manual_verification?: {
    id: string;
    status: string;
    document_type: string;
    submitted_at: string;
  } | null;
}

const DOC_TYPES = [
  { value: "license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "identity", label: "Identity card" },
];

const STATUS_BADGE: Record<VerificationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Not started", variant: "outline" },
  in_progress: { label: "Under review", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  reset: { label: "Reset", variant: "outline" },
};

export default function VerificationPage() {
  const { bundle } = useConfigBundle();
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Manual upload state
  const [docType, setDocType] = useState("license");
  const [country, setCountry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const env = bundle?.meta?.env ?? "production";

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: StatusResponse }>(`/api/provider/verification/status?environment=${encodeURIComponent(env)}`);
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

  const status = statusData?.status ?? "pending";
  const sumsubAvailable = statusData?.sumsub_available ?? false;
  const badgeCfg = STATUS_BADGE[status];

  // ─── SumSub launch ────────────────────────────────────────────────────────
  const getNewToken = useCallback(async () => {
    const res = await fetcher.get<{ data: { access_token: string } }>(`/api/provider/verification/sumsub/token?environment=${encodeURIComponent(env)}`);
    return res.data?.access_token ?? "";
  }, [env]);

  const launchVerification = async () => {
    setLaunching(true);
    try {
      const tokenRes = await fetcher.get<{ data: { access_token: string } }>(`/api/provider/verification/sumsub/token?environment=${encodeURIComponent(env)}`);
      const token = tokenRes.data?.access_token;
      if (!token) {
        toast.error("Could not start verification — please try the manual upload below.");
        setLaunching(false);
        return;
      }
      setSdkReady(true);
      setStatusData((prev) => prev ? { ...prev, status: "in_progress" } : prev);

      const script = document.createElement("script");
      script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
      script.async = true;
      script.onload = () => {
        const w = window as any;
        if (w.snsWebSdk?.init && containerRef.current) {
          try {
            w.snsWebSdk.init(token, getNewToken);
          } catch (e) {
            console.error("Sumsub init error:", e);
            toast.error("Verification could not be loaded. Use the manual upload below.");
          }
        }
        setLaunching(false);
      };
      script.onerror = () => {
        toast.error("Verification service unavailable. Use the manual upload below.");
        setLaunching(false);
      };
      document.body.appendChild(script);
    } catch {
      toast.error("Failed to start verification");
      setLaunching(false);
    }
  };

  // ─── Manual upload ────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  const submitManual = async () => {
    if (!file || !country.trim()) {
      toast.error("Please select a document photo and enter the country of issue.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("document_type", docType);
      form.append("country", country.trim());

      const res = await fetcher.post<{ data: { status: string } }>("/api/me/verification", form);
      if ((res as any).error) {
        toast.error((res as any).error?.message ?? "Upload failed. Please try again.");
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

  const isApproved = status === "approved";
  const isUnderReview = status === "in_progress" || statusData?.manual_verification?.status === "pending";
  const canResubmit = status === "rejected" || status === "reset";
  const canStart = status === "pending" || canResubmit;

  return (
    <SettingsDetailLayout title="Identity verification" subtitle="Verify your identity for compliance and payouts.">
      {/* Status card */}
      <SectionCard title="Verification status">
        <div className="flex items-center gap-3 mb-4">
          {isApproved ? (
            <ShieldCheck className="h-8 w-8 text-green-600 flex-shrink-0" />
          ) : isUnderReview ? (
            <Clock className="h-8 w-8 text-amber-500 flex-shrink-0" />
          ) : status === "rejected" ? (
            <XCircle className="h-8 w-8 text-red-500 flex-shrink-0" />
          ) : (
            <ShieldAlert className="h-8 w-8 text-amber-600 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {isApproved
                ? "Identity verified"
                : isUnderReview
                  ? "Under review"
                  : status === "rejected"
                    ? "Verification declined"
                    : "Not yet verified"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isApproved
                ? "Your identity has been verified."
                : isUnderReview
                  ? "Your document has been submitted. We'll notify you once reviewed."
                  : status === "rejected"
                    ? "Your verification was not approved. Please submit again or contact support."
                    : "Submit an ID document for our team to review."}
            </p>
          </div>
          <Badge variant={badgeCfg.variant}>{badgeCfg.label}</Badge>
        </div>

        {/* SumSub flow (when available and not yet verified) */}
        {sumsubAvailable && !isApproved && !sdkReady && (
          <Button onClick={launchVerification} disabled={launching} className="mb-4">
            {launching ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Starting…</> : "Start automated verification"}
          </Button>
        )}
        {sdkReady && (
          <div ref={containerRef} id="sumsub-websdk-container" className="min-h-[400px] w-full rounded-lg border" />
        )}
      </SectionCard>

      {/* Manual document upload — shown when SumSub is not available OR as fallback */}
      {!isApproved && !isUnderReview && (
        <SectionCard
          title={sumsubAvailable ? "Alternative: Manual document upload" : "Upload ID document"}
          className="mt-4"
        >
          {!sumsubAvailable && (
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
                        ? "bg-[#FF0077] text-white"
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
              <label className="block text-sm font-medium mb-1">Country of issue</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF0077]"
                placeholder="e.g. South Africa"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium mb-1">Document photo</label>
              <label
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                  file ? "border-[#FF0077] bg-pink-50" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {file ? (
                  <>
                    <FileText className="h-8 w-8 text-[#FF0077]" />
                    <span className="text-sm font-medium text-gray-900">{file.name}</span>
                    <span className="text-xs text-[#FF0077]">Click to change</span>
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
              className="w-full bg-[#FF0077] hover:bg-[#e6006b]"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</> : "Submit for verification"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Your document is stored securely and used only for identity verification.
            </p>
          </div>
        </SectionCard>
      )}

      {/* Under review — info only */}
      {isUnderReview && !isApproved && (
        <SectionCard title="Document submitted" className="mt-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-700">
                Your document has been received and is being reviewed by our team. This usually takes 1–2 business days. {"We'll"} notify you once it has been processed.
              </p>
              {statusData?.manual_verification?.document_type && (
                <p className="text-xs text-muted-foreground mt-2">
                  Document: {statusData.manual_verification.document_type} · Submitted:{" "}
                  {new Date(statusData.manual_verification.submitted_at).toLocaleDateString()}
                </p>
              )}
            </div>
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

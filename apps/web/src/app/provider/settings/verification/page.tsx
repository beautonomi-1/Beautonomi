"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";

type VerificationStatus = "pending" | "in_progress" | "approved" | "rejected" | "reset";

export default function VerificationPage() {
  const sumsubConfig = useModuleConfig("sumsub") as { enabled?: boolean } | undefined;
  const verificationEnabled = useFeatureFlag("verification.sumsub.enabled");
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const enabled = Boolean(sumsubConfig?.enabled) || verificationEnabled;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: { status: VerificationStatus } }>("/api/provider/verification/status");
      setStatus(res.data?.status ?? "pending");
    } catch {
      setStatus("pending");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const getNewToken = useCallback(async () => {
    const res = await fetcher.get<{ data: { access_token: string } }>("/api/provider/verification/sumsub/token");
    return res.data?.access_token ?? "";
  }, []);

  const launchVerification = async () => {
    if (!enabled || !containerRef.current) return;
    setLaunching(true);
    try {
      const tokenRes = await fetcher.get<{ data: { access_token: string } }>("/api/provider/verification/sumsub/token");
      const token = tokenRes.data?.access_token;
      if (!token) {
        toast.error("Could not start verification");
        setLaunching(false);
        return;
      }
      setSdkReady(true);
      setStatus("in_progress");

      const script = document.createElement("script");
      script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
      script.async = true;
      script.onload = () => {
        const w = window as unknown as { snsWebSdk?: { init: (token: string, refresh: () => Promise<string>) => void } };
        if (w.snsWebSdk?.init && containerRef.current) {
          try {
            w.snsWebSdk.init(token, getNewToken);
          } catch (e) {
            console.error("Sumsub init error:", e);
            toast.error("Verification could not be loaded. Try again or contact support.");
          }
        }
        setLaunching(false);
      };
      script.onerror = () => {
        toast.error("Verification service failed to load. Try again later.");
        setLaunching(false);
      };
      document.body.appendChild(script);
    } catch {
      toast.error("Failed to start verification");
      setLaunching(false);
    }
  };

  if (loading) {
    return (
      <SettingsDetailLayout title="Identity verification" description="Verify your identity with Sumsub (KYC).">
        <LoadingTimeout loadingMessage="Loading..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Identity verification" description="Verify your identity for payouts and compliance.">
      {!enabled && (
        <Alert className="mb-6">
          <AlertDescription>Verification is not enabled for your region. Contact support if you need to verify.</AlertDescription>
        </Alert>
      )}

      <SectionCard title="Verification status">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {status === "approved" && (
              <>
                <ShieldCheck className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium">Verified</p>
                  <p className="text-sm text-muted-foreground">Your identity has been verified.</p>
                </div>
                <Badge variant="default" className="bg-green-600">Approved</Badge>
              </>
            )}
            {(status === "pending" || status === "in_progress" || status === null) && (
              <>
                <ShieldAlert className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="font-medium">{status === "in_progress" ? "Verification in progress" : "Not verified"}</p>
                  <p className="text-sm text-muted-foreground">
                    {status === "in_progress" ? "Complete the steps in the form below." : "Verify your identity to enable payouts and compliance."}
                  </p>
                </div>
                {status === "in_progress" && <Badge variant="secondary">In progress</Badge>}
              </>
            )}
            {status === "rejected" && (
              <>
                <ShieldAlert className="h-8 w-8 text-red-600" />
                <div>
                  <p className="font-medium">Verification declined</p>
                  <p className="text-sm text-muted-foreground">Contact support to resolve.</p>
                </div>
                <Badge variant="destructive">Rejected</Badge>
              </>
            )}
          </div>

          {enabled && status !== "approved" && (
            <>
              {!sdkReady ? (
                <Button onClick={launchVerification} disabled={launching}>
                  {launching ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Starting…</> : "Start verification"}
                </Button>
              ) : (
                <div ref={containerRef} id="sumsub-websdk-container" className="min-h-[400px] w-full" />
              )}
            </>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}

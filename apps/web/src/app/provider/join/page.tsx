"use client";

import { useTranslation } from "@beautonomi/i18n";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import PlatformLogo from "@/components/platform/PlatformLogo";
import { clearProviderGateCache } from "@/app/provider/ProviderPortalGate";

type ValidateResponse = {
  valid: boolean;
  already_accepted: boolean;
  expired: boolean;
  business_name: string | null;
  staff_name: string | null;
  email_hint: string | null;
};

type AppLinks = {
  ios: string | null;
  android: string | null;
  huawei: string | null;
};

export default function ProviderStaffJoinPageWrapper() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          {t("web.provider.pages.join.loading")}
        </div>
      }
    >
      <ProviderStaffJoinPage />
    </Suspense>
  );
}

function ProviderStaffJoinPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const { user, isLoading: authLoading, signOut } = useAuth();

  const [preview, setPreview] = useState<ValidateResponse | null>(null);
  const [appLinks, setAppLinks] = useState<AppLinks | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError(t("web.provider.pages.join.missingToken"));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: ValidateResponse }>(
          `/api/provider/staff/join/validate?token=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setPreview(res.data ?? null);
        if (res.data?.expired && !res.data.already_accepted) {
          setLoadError(t("web.provider.pages.join.expired"));
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t("web.provider.pages.join.loadFailed"));
      }
    })();

    (async () => {
      try {
        const res = await fetcher.get<{ data: AppLinks }>("/api/public/apps?type=provider");
        if (!cancelled) setAppLinks(res.data ?? null);
      } catch {
        /* optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = useCallback(async () => {
    if (!token || !user) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await fetcher.post("/api/provider/staff/join/accept", { token });
      clearProviderGateCache();
      router.replace("/provider/dashboard");
    } catch (err) {
      const msg =
        err instanceof FetchError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("web.provider.pages.join.acceptFailed");
      setAcceptError(msg);
    } finally {
      setAccepting(false);
    }
  }, [token, user, router]);

  useEffect(() => {
    if (authLoading || !user || !token || !preview?.valid) return;
    if (preview.expired && !preview.already_accepted) return;
    void handleAccept();
  }, [authLoading, user, token, preview, handleAccept]);

  const loginHref = `/login?next=${encodeURIComponent(`/provider/join?token=${token}`)}`;
  const businessName = preview?.business_name || t("web.provider.pages.join.teamFallback");

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <PlatformLogo alt={t("web.provider.pages.join.logoAlt")} className="h-10 w-auto" width={160} height={40} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("web.provider.pages.join.joinTitle", { name: businessName })}</h1>
          <p className="text-gray-600 mb-6">
            {preview?.staff_name
              ? t("web.provider.pages.join.inviteNamed", { name: preview.staff_name })
              : t("web.provider.pages.join.inviteGeneric")}
          </p>

          {loadError ? (
            <p className="text-sm text-red-600 mb-4">{loadError}</p>
          ) : null}

          {acceptError ? (
            <p className="text-sm text-red-600 mb-4">{acceptError}</p>
          ) : null}

          {!token ? null : authLoading ? (
            <p className="text-sm text-gray-500">{t("web.provider.pages.join.loading")}</p>
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {t("web.provider.pages.join.signInWithEmail")}{" "}
                {preview?.email_hint ? (
                  <span className="font-medium">{preview.email_hint}</span>
                ) : (
                  t("web.provider.pages.join.theEmailThatReceived")
                )}
                {t("web.provider.pages.join.signInHint")}
              </p>
              <Button asChild className="w-full">
                <Link href={loginHref}>{t("web.provider.pages.join.continueToSignIn")}</Link>
              </Button>
            </div>
          ) : accepting ? (
            <p className="text-sm text-gray-500">{t("web.provider.pages.join.settingUp")}</p>
          ) : preview?.already_accepted ? (
            <Button
              className="w-full"
              onClick={() => {
                clearProviderGateCache();
                router.replace("/provider/dashboard");
              }}
            >
              {t("web.provider.subscription.goToDashboard")}
            </Button>
          ) : (
            <Button className="w-full" onClick={handleAccept} disabled={!preview?.valid}>
              {t("web.provider.pages.join.acceptInvite")}
            </Button>
          )}

          {user ? (
            <button
              type="button"
              className="mt-4 text-xs text-gray-500 underline w-full text-center"
              onClick={() => signOut().then(() => router.push(loginHref))}
            >
              {t("web.provider.pages.join.differentAccount")}
            </button>
          ) : null}
        </div>

        {(appLinks?.ios || appLinks?.android) && (
          <div className="mt-8 text-center">
            <p className="text-sm font-semibold text-gray-900 mb-3">{t("web.provider.pages.join.getApp")}</p>
            <div className="flex flex-col gap-2">
              {appLinks.ios ? (
                <a
                  href={appLinks.ios}
                  className="text-sm text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("web.provider.pages.join.downloadIos")}
                </a>
              ) : null}
              {appLinks.android ? (
                <a
                  href={appLinks.android}
                  className="text-sm text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("web.provider.pages.join.downloadAndroid")}
                </a>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

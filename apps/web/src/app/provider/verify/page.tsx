"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { SessionVerifyPanel } from "@/components/auth/security/SessionVerifyPanel";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/provider") || raw.startsWith("//") || raw.startsWith("/provider/verify")) {
    return "/provider/dashboard";
  }
  return raw;
}

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const next = safeNext(params.get("next"));

  const onDone = useCallback(() => router.replace(next), [router, next]);
  const onSignOut = useCallback(() => {
    void signOut().finally(() => router.replace("/login"));
  }, [signOut, router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t("web.provider.sessionVerify.title")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("web.provider.sessionVerify.body")}</p>
      </div>
      <SessionVerifyPanel onDone={onDone} onSignOut={onSignOut} />
    </div>
  );
}

export default function ProviderVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}

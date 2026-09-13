"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { invalidateProviderPortalCache, useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Staff who do not own a salon can start freelancer/salon onboarding,
 * or leave the current team (Fresha/Square-style memberships).
 */
export function StartOwnBusinessCard() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { provider } = useProviderPortal();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  if (role !== "provider_staff") return null;

  async function leaveTeam() {
    if (!provider?.id) return;
    const salon = provider.business_name ?? t("web.startOwnBusiness.thisTeam");
    if (
      !window.confirm(
        t("web.startOwnBusiness.leaveConfirm", { salon }),
      )
    ) {
      return;
    }
    setLeaving(true);
    try {
      const res = await fetcher.post<{
        data?: { role?: string; active_provider_id?: string | null };
      }>("/api/provider/memberships/leave", { provider_id: provider.id });
      const payload = (res as { data?: { role?: string; active_provider_id?: string | null } }).data;
      invalidateProviderPortalCache();
      toast.success(t("web.startOwnBusiness.leftTeam"));
      if (payload?.role === "provider_onboarding" || !payload?.active_provider_id) {
        router.replace("/provider/onboarding");
        return;
      }
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.startOwnBusiness.leaveFailed"));
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">{t("web.startOwnBusiness.career")}</p>
      <p className="mt-1 text-base font-semibold text-gray-900">{t("web.startOwnBusiness.readyIndependent")}</p>
      <p className="mt-1 text-sm text-gray-600">
        {t("web.startOwnBusiness.keepOrOpen")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/provider/onboarding">{t("web.startOwnBusiness.cta")}</Link>
        </Button>
        {provider?.id ? (
          <Button variant="outline" disabled={leaving} onClick={() => void leaveTeam()}>
            {leaving ? t("web.startOwnBusiness.leaving") : t("web.startOwnBusiness.leaveTeam")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

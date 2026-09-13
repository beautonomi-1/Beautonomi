"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { ChevronRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

const marketingIntegrations = [
  {
    titleKey: "emailIntegration",
    descriptionKey: "emailIntegrationHint",
    href: "/provider/settings/integrations/email",
  },
  {
    titleKey: "twilioIntegration",
    descriptionKey: "twilioIntegrationHint",
    href: "/provider/settings/integrations/twilio",
  },
];

type CreditBalance = {
  included_balance_zar: number;
  purchased_balance_zar: number;
  total_zar: number;
};

type MarketingStatus = {
  use_platform_credentials: boolean;
  marketing_enabled?: boolean;
  sending_mode: "platform" | "own_integrations" | "configure_integrations";
  has_own_twilio: boolean;
  has_own_email: boolean;
  platform_available?: boolean;
  credits_apply_on?: string[];
  balance: CreditBalance;
};

export default function MarketingIntegrationsPage() {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [status, setStatus] = useState<MarketingStatus | null>(null);
  const [topupAmount, setTopupAmount] = useState("50");
  const [topupBusy, setTopupBusy] = useState(false);

  useEffect(() => {
    void loadCredits();
    void loadStatus();
  }, []);

  const loadCredits = async () => {
    try {
      const res = await fetcher.get<{ data: CreditBalance }>("/api/provider/marketing/credits");
      setBalance(res.data);
    } catch {
      setBalance(null);
    }
  };

  const loadStatus = async () => {
    try {
      const res = await fetcher.get<{ data: MarketingStatus }>("/api/provider/marketing/status");
      setStatus(res.data);
      if (res.data?.balance) setBalance(res.data.balance);
    } catch {
      setStatus(null);
    }
  };

  const handleTopup = async () => {
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount < 10) {
      toast.error(t("web.provider.settings.pages.marketing-integrations.minimumTopUpIsR10"));
      return;
    }
    setTopupBusy(true);
    try {
      const res = await fetcher.post<{ data: { payment_url?: string } }>(
        "/api/provider/marketing/credits/topup",
        { amount_zar: amount },
      );
      const url = res.data?.payment_url;
      if (url) {
        window.location.href = url;
      } else {
        toast.error(t("web.provider.settings.pages.marketing-integrations.couldNotStartPaystackCheckout"));
      }
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : t("web.provider.settings.pages.marketing-integrations.topUpFailed"));
    } finally {
      setTopupBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("web.provider.settings.categories.marketingIntegrations.title")}
        subtitle={t("web.provider.settings.categories.marketingIntegrations.description")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.marketing-integrations.marketingIntegrations") },
        ]}
      />

      <div className="mt-6 space-y-6">
        {status && (
          <SectionCard>
            <h3 className="text-lg font-semibold">{t("web.provider.settings.pages.marketing-integrations.sendingMode")}</h3>
            <p className="mt-2 text-sm text-gray-700">
              {status.sending_mode === "platform" && (
                <>
                  <strong>{t("web.provider.settings.pages.marketing-integrations.usingPlatformStrong")}</strong>{t("web.provider.settings.pages.marketing-integrations.usingPlatformBody")}
                </>
              )}
              {status.sending_mode === "own_integrations" && (
                <>
                  <strong>{t("web.provider.settings.pages.marketing-integrations.usingOwnStrong")}</strong>{" "}
                  {status.has_own_twilio && t("web.provider.settings.pages.marketing-integrations.twilioConnected")}
                  {status.has_own_email && t("web.provider.settings.pages.marketing-integrations.emailConnected")}
                  {t("web.provider.settings.pages.marketing-integrations.creditsNotDebited")}
                </>
              )}
              {status.sending_mode === "configure_integrations" && (
                <>
                  {t("web.provider.settings.pages.marketing-integrations.connectBelow")}{" "}
                  <strong>{t("web.provider.settings.pages.marketing-integrations.platformSending")}</strong> {t("web.provider.settings.pages.marketing-integrations.connectBelowSuffix")}
                </>
              )}
            </p>
            {status.platform_available && status.credits_apply_on && status.credits_apply_on.length > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                {t("web.provider.settings.pages.marketing-integrations.creditsApplyTo", { items: status.credits_apply_on.join(", ") })}
              </p>
            )}
            {status.platform_available && !status.use_platform_credentials && (
              <p className="mt-2 text-xs text-amber-700">
                {t("web.provider.settings.pages.marketing-integrations.platformSendingDisabled")}
              </p>
            )}
            {status.use_platform_credentials && status.sending_mode !== "platform" && (
              <p className="mt-2 text-xs text-amber-700">
                {t("web.provider.settings.pages.marketing-integrations.ownTakesPrecedence")}
              </p>
            )}
          </SectionCard>
        )}

        <SectionCard>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{t("web.provider.settings.pages.marketing-integrations.platformCredits")}</h3>
              <p className="mt-1 text-sm text-gray-600">
                {t("web.provider.settings.pages.marketing-integrations.platformCreditsHint")} {t("web.provider.settings.pages.marketing-integrations.transactionalFree")}
              </p>
              {balance && (
                <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">{t("web.provider.settings.pages.marketing-integrations.totalBalance")}</dt>
                    <dd className="text-lg font-semibold">{formatCurrency(balance.total_zar, "ZAR")}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t("web.provider.settings.pages.marketing-integrations.includedResets")}</dt>
                    <dd>{formatCurrency(balance.included_balance_zar, "ZAR")}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t("web.provider.settings.pages.marketing-integrations.purchasedRollovers")}</dt>
                    <dd>{formatCurrency(balance.purchased_balance_zar, "ZAR")}</dd>
                  </div>
                </dl>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  {t("web.provider.settings.pages.marketing-integrations.topUpAmount")}
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className="mt-1 block w-32 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <Button type="button" disabled={topupBusy || !status?.use_platform_credentials} onClick={() => void handleTopup()}>
                  {topupBusy ? t("web.provider.settings.pages.marketing-integrations.redirecting") : t("web.provider.settings.pages.marketing-integrations.topUpViaPaystack")}
                </Button>
                <Button type="button" variant="outline" onClick={() => void loadCredits()}>
                  {t("web.provider.settings.pages.marketing-integrations.refresh")}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="mb-2 text-lg font-semibold">{t("web.provider.settings.pages.marketing-integrations.ownIntegrations")}</h3>
          <p className="mb-6 text-sm text-gray-600">
            {t("web.provider.settings.pages.marketing-integrations.ownIntegrationsHint")}
          </p>
          <div className="space-y-2">
            {marketingIntegrations.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
              >
                <div>
                  <h4 className="font-medium">{t(`web.provider.settings.pages.marketing-integrations.${item.titleKey}`)}</h4>
                  <p className="text-sm text-gray-600">{t(`web.provider.settings.pages.marketing-integrations.${item.descriptionKey}`)}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

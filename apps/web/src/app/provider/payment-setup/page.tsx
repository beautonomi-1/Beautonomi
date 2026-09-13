"use client";

import { useTranslation } from "@beautonomi/i18n";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { ArrowUpRight, ChevronRight, CreditCard, FileText, Gift, QrCode, Smartphone, Wallet } from "lucide-react";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export default function PaymentSetupPage() {
  const { t } = useTranslation();
  const setupItems = [
    {
      icon: Wallet,
      label: t("web.provider.pages.payment-setup.payoutAccounts"),
      subtitle: t("web.provider.pages.payment-setup.payoutAccountsDesc"),
      href: "/provider/settings/payout-accounts",
      flag: null as string | null,
    },
    {
      icon: ArrowUpRight,
      label: t("web.provider.pages.payment-setup.requestPayout"),
      subtitle: t("web.provider.pages.payment-setup.requestPayoutDesc"),
      href: "/provider/finance?tab=payouts",
      flag: null,
    },
    {
      icon: FileText,
      label: t("web.provider.pages.payment-setup.statements"),
      subtitle: t("web.provider.pages.payment-setup.statementsDesc"),
      href: "/provider/payouts/statements",
      flag: null,
    },
    {
      icon: Smartphone,
      label: t("web.provider.pages.payment-setup.yoco"),
      subtitle: t("web.provider.pages.payment-setup.yocoDesc"),
      href: "/provider/settings/sales/yoco-integration",
      flag: "payment_yoco",
    },
    {
      icon: CreditCard,
      label: t("web.provider.sidebar.items.cardMachines"),
      subtitle: t("web.provider.pages.payment-setup.cardMachinesDesc"),
      href: "/provider/settings/sales/card-machines",
      flag: "payment_paycloud",
    },
    {
      icon: QrCode,
      label: t("web.provider.sidebar.items.paystackTerminal"),
      subtitle: t("web.provider.pages.payment-setup.paystackDesc"),
      href: "/provider/settings/sales/paystack-terminal",
      flag: "payment_paystack_virtual_terminal",
    },
    {
      icon: Gift,
      label: t("web.provider.settings.pages.payments.giftCards"),
      subtitle: t("web.provider.pages.payment-setup.giftCardsDesc"),
      href: "/provider/settings/sales/gift-cards",
      flag: null,
    },
    {
      icon: CreditCard,
      label: t("web.provider.settings.categories.sales.items.terminalShop.title"),
      subtitle: t("web.provider.pages.payment-setup.terminalShopDesc"),
      href: "/provider/settings/sales/terminal-shop",
      flag: "terminal_ecommerce_enabled",
    },
  ];
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalEcommerceEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE);
  const terminalCatalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const terminalShopEnabled = terminalEcommerceEnabled || terminalCatalogEnabled;

const visibleItems = setupItems.filter((item) => {
    if (item.flag === "payment_yoco") return yocoEnabled;
    if (item.flag === "payment_paycloud") return paycloudEnabled;
    if (item.flag === "payment_paystack_virtual_terminal") return paystackTerminalEnabled;
    if (item.flag === "terminal_ecommerce_enabled") return terminalShopEnabled;
    return true;
  });

  return (
    <div>
      <PageHeader
title={t("web.provider.pages.payment-setup.title")}
subtitle={t("web.provider.pages.payment-setup.subtitle")}
        breadcrumbs={[
{ label: t("web.provider.moreHub.title"), href: "/provider/more" },
{ label: t("web.provider.pages.payment-setup.title") },
        ]}
      />
      <div className="mt-6 space-y-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Icon className="h-5 w-5 text-blue-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.subtitle}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

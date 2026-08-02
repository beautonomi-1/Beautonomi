"use client";

import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { ArrowUpRight, ChevronRight, CreditCard, FileText, Gift, QrCode, Smartphone, Wallet } from "lucide-react";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const SETUP_ITEMS = [
  {
    icon: Wallet,
    label: "Payout bank accounts",
    subtitle: "Add, verify and manage payout accounts",
    href: "/provider/settings/payout-accounts",
    flag: null as string | null,
  },
  {
    icon: ArrowUpRight,
    label: "Request payout & history",
    subtitle: "Withdraw available balance and view transfer status",
    href: "/provider/finance?tab=payouts",
    flag: null,
  },
  {
    icon: FileText,
    label: "Payout statements",
    subtitle: "Download earnings and payout CSV for accounting",
    href: "/provider/payouts/statements",
    flag: null,
  },
  {
    icon: Smartphone,
    label: "Yoco payments",
    subtitle: "Connect Yoco and manage card devices",
    href: "/provider/settings/sales/yoco-integration",
    flag: "payment_yoco",
  },
  {
    icon: CreditCard,
    label: "Card machines",
    subtitle: "Manage terminals, shop & payments",
    href: "/provider/settings/sales/card-machines",
    flag: "payment_paycloud",
  },
  {
    icon: QrCode,
    label: "Paystack Terminal",
    subtitle: "QR and link payments through Beautonomi payouts",
    href: "/provider/settings/sales/paystack-terminal",
    flag: "payment_paystack_virtual_terminal",
  },
  {
    icon: Gift,
    label: "Gift cards",
    subtitle: "Accept platform gift cards",
    href: "/provider/settings/sales/gift-cards",
    flag: null,
  },
  {
    icon: CreditCard,
    label: "Terminal Shop",
    subtitle: "Order card machines from the Beautonomi catalog",
    href: "/provider/settings/sales/terminal-shop",
    flag: "terminal_ecommerce_enabled",
  },
];

export default function PaymentSetupPage() {
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalEcommerceEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.TERMINAL_ECOMMERCE);
  const terminalCatalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const terminalShopEnabled = terminalEcommerceEnabled || terminalCatalogEnabled;

  const visibleItems = SETUP_ITEMS.filter((item) => {
    if (item.flag === "payment_yoco") return yocoEnabled;
    if (item.flag === "payment_paycloud") return paycloudEnabled;
    if (item.flag === "payment_paystack_virtual_terminal") return paystackTerminalEnabled;
    if (item.flag === "terminal_ecommerce_enabled") return terminalShopEnabled;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Payment setup"
        subtitle="Payout accounts, terminals & gift cards"
        breadcrumbs={[
          { label: "More", href: "/provider/more" },
          { label: "Payment setup" },
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

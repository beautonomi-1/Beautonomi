"use client";

import React, { useEffect, useState } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { ChevronRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

const marketingIntegrations = [
  {
    title: "Email Integration",
    description: "Connect SendGrid or Mailchimp for email marketing campaigns",
    href: "/provider/settings/integrations/email",
  },
  {
    title: "Twilio Integration",
    description: "Connect Twilio for SMS and WhatsApp marketing campaigns",
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
      toast.error("Minimum top-up is R10");
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
        toast.error("Could not start Paystack checkout");
      }
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Top-up failed");
    } finally {
      setTopupBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Marketing Integrations"
        subtitle="Connect third-party services or use platform marketing credits"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Marketing Integrations" },
        ]}
      />

      <div className="mt-6 space-y-6">
        {status && (
          <SectionCard>
            <h3 className="text-lg font-semibold">Sending mode</h3>
            <p className="mt-2 text-sm text-gray-700">
              {status.sending_mode === "platform" && (
                <>
                  <strong>Using Beautonomi platform sending.</strong> Promotional messages debit your marketing
                  credits below.
                </>
              )}
              {status.sending_mode === "own_integrations" && (
                <>
                  <strong>Using your own integrations.</strong>{" "}
                  {status.has_own_twilio && "Twilio connected. "}
                  {status.has_own_email && "Email provider connected. "}
                  Platform credits are not debited for sends on your credentials.
                </>
              )}
              {status.sending_mode === "configure_integrations" && (
                <>
                  Connect SendGrid/Mailchimp or Twilio below, or enable{" "}
                  <strong>Platform sending</strong> on your subscription plan (any plan — not Growth-only).
                </>
              )}
            </p>
            {status.platform_available && status.credits_apply_on && status.credits_apply_on.length > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                Platform credits apply to: {status.credits_apply_on.join(", ")}.
              </p>
            )}
            {status.platform_available && !status.use_platform_credentials && (
              <p className="mt-2 text-xs text-amber-700">
                Platform sending is disabled for this provider (plan or admin override).
              </p>
            )}
            {status.use_platform_credentials && status.sending_mode !== "platform" && (
              <p className="mt-2 text-xs text-amber-700">
                Your plan includes platform sending, but own integrations take precedence when connected.
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
              <h3 className="text-lg font-semibold">Platform marketing credits</h3>
              <p className="mt-1 text-sm text-gray-600">
                When your plan includes platform sending, promotional SMS/email/WhatsApp debits this balance.
                Transactional notifications are free.
              </p>
              {balance && (
                <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Total balance</dt>
                    <dd className="text-lg font-semibold">R{balance.total_zar.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Included (resets monthly)</dt>
                    <dd>R{balance.included_balance_zar.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Purchased (rolls over)</dt>
                    <dd>R{balance.purchased_balance_zar.toFixed(2)}</dd>
                  </div>
                </dl>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  Top-up amount (ZAR)
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
                  {topupBusy ? "Redirecting…" : "Top up via Paystack"}
                </Button>
                <Button type="button" variant="outline" onClick={() => void loadCredits()}>
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="mb-2 text-lg font-semibold">Own integrations</h3>
          <p className="mb-6 text-sm text-gray-600">
            Connect your SendGrid/Mailchimp or Twilio account. Sends on your credentials are not debited from platform credits.
          </p>
          <div className="space-y-2">
            {marketingIntegrations.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
              >
                <div>
                  <h4 className="font-medium">{item.title}</h4>
                  <p className="text-sm text-gray-600">{item.description}</p>
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

"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";

type LiveTotals = { total: number; commission: number; tips: number };

interface PayStub {
  pay_run_id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  gross_pay: number;
  commission_amount: number;
  hourly_amount: number;
  salary_amount: number;
  tips_amount: number;
  manual_deductions: number;
  tax_deduction: number;
  uif_contribution: number;
  net_pay: number;
  notes?: string;
}

export default function MyEarningsPage() {
  const { t } = useTranslation();
  const { format: fmtMoney } = useProviderMoneyFormat();
  const [payStubs, setPayStubs] = useState<PayStub[]>([]);
  const [live, setLive] = useState<Record<string, LiveTotals> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{
        data?: {
          pay_stubs?: PayStub[];
          live?: Record<string, LiveTotals>;
        };
      }>("/api/provider/pay-runs/my-earnings");
      const payload = response.data;
      setPayStubs(Array.isArray(payload?.pay_stubs) ? payload.pay_stubs : []);
      setLive(payload?.live ?? null);
    } catch (err) {
      console.error("Failed to load earnings:", err);
      toast.error(t("web.provider.pages.team/my-earnings.failedToLoad"));
      setPayStubs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "draft") return "bg-amber-100 text-amber-800";
    if (s === "approved") return "bg-blue-100 text-blue-800";
    if (s === "paid") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("web.provider.sidebar.items.myEarnings")} subtitle={t("web.provider.pages.team/my-earnings.subtitleShort")} />
        <SectionCard>
          <Skeleton className="h-48 w-full" />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      <PageHeader
        title={t("web.provider.sidebar.items.myEarnings")}
        subtitle={t("web.provider.pages.team/my-earnings.subtitle")}
        breadcrumbs={[
          { label: t("web.provider.sidebar.items.team"), href: "/provider/team/members" },
          { label: t("web.provider.sidebar.items.myEarnings") },
        ]}
      />

      {live ? (
        <SectionCard className="p-4">
          <p className="text-sm font-semibold text-gray-900 mb-3">{t("web.provider.pages.team/my-earnings.liveEarnings")}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {(["today", "week", "month"] as const).map((key) => (
              <div key={key}>
                <p className="text-xs uppercase text-gray-500">{t(`web.provider.pages.team/my-earnings.period${key.charAt(0).toUpperCase()}${key.slice(1)}`)}</p>
                <p className="font-medium">{fmtMoney(Number(live[key]?.total ?? 0))}</p>
                <p className="text-xs text-gray-500">
                  {t("web.provider.pages.team/my-earnings.commissionTips", { commission: fmtMoney(Number(live[key]?.commission ?? 0)), tips: fmtMoney(Number(live[key]?.tips ?? 0)) })}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {payStubs.length === 0 ? (
        <SectionCard className="p-8 text-center">
          <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">{t("web.provider.pages.team/my-earnings.noPayStubs")}</h3>
          <p className="text-sm text-gray-600">{t("web.provider.pages.team/my-earnings.noPayStubsHint")}</p>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {payStubs.map((stub) => {
            const isExpanded = expandedId === stub.pay_run_id;
            return (
              <SectionCard key={stub.pay_run_id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : stub.pay_run_id)}
                  className="w-full flex items-center justify-between py-2 text-start"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">
                        {format(new Date(stub.pay_period_start), "MMM d")} – {format(new Date(stub.pay_period_end), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-gray-500">{t("web.provider.pages.team/my-earnings.netLabel", { amount: fmtMoney(Number(stub.net_pay)) })}</p>
                    </div>
                    <Badge className={statusColor(stub.status)}>{stub.status}</Badge>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>
                {isExpanded && (
                  <div className="pt-4 mt-2 border-t space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("web.provider.pages.team/payroll/[id].csvGrossPay")}</span>
                      <span>{fmtMoney(Number(stub.gross_pay))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("web.provider.pages.team/payroll/[id].commission")}</span>
                      <span>{fmtMoney(Number(stub.commission_amount))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("web.provider.pages.team/payroll/[id].hourly")}</span>
                      <span>{fmtMoney(Number(stub.hourly_amount))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("web.provider.pages.team/payroll/[id].salary")}</span>
                      <span>{fmtMoney(Number(stub.salary_amount))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("web.provider.pages.team/payroll/[id].tips")}</span>
                      <span>{fmtMoney(Number(stub.tips_amount))}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>{t("web.provider.pages.team/my-earnings.deductions")}</span>
                      <span>
                        -{fmtMoney(
                          Number(stub.manual_deductions) +
                          Number(stub.tax_deduction) +
                          Number(stub.uif_contribution)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>{t("web.provider.pages.team/payroll/[id].csvNetPay")}</span>
                      <span>{fmtMoney(Number(stub.net_pay))}</span>
                    </div>
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

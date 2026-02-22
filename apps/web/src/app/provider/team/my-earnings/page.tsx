"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";

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
  const [payStubs, setPayStubs] = useState<PayStub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PayStub[] }>("/api/provider/pay-runs/my-earnings");
      setPayStubs((response as any)?.data ?? []);
    } catch (err) {
      console.error("Failed to load earnings:", err);
      toast.error("Failed to load earnings");
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
        <PageHeader title="My Earnings" subtitle="View your pay stubs" />
        <SectionCard>
          <Skeleton className="h-48 w-full" />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      <PageHeader
        title="My Earnings"
        subtitle="View your pay stubs and earnings history"
        breadcrumbs={[
          { label: "Team", href: "/provider/team/members" },
          { label: "My Earnings" },
        ]}
      />

      {payStubs.length === 0 ? (
        <SectionCard className="p-8 text-center">
          <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="font-medium text-gray-900 mb-2">No pay stubs yet</h3>
          <p className="text-sm text-gray-600">When your employer runs payroll, your pay stubs will appear here.</p>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {payStubs.map((stub) => {
            const isExpanded = expandedId === stub.pay_run_id;
            return (
              <SectionCard key={stub.pay_run_id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : stub.pay_run_id)}
                  className="w-full flex items-center justify-between py-2 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">
                        {format(new Date(stub.pay_period_start), "MMM d")} – {format(new Date(stub.pay_period_end), "MMM d, yyyy")}
                      </p>
                      <p className="text-xs text-gray-500">Net: R{Number(stub.net_pay).toFixed(2)}</p>
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
                      <span className="text-gray-600">Gross Pay</span>
                      <span>R{Number(stub.gross_pay).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Commission</span>
                      <span>R{Number(stub.commission_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Hourly</span>
                      <span>R{Number(stub.hourly_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Salary</span>
                      <span>R{Number(stub.salary_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tips</span>
                      <span>R{Number(stub.tips_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-red-600">
                      <span>Deductions (Tax, UIF, Other)</span>
                      <span>
                        -R
                        {(
                          Number(stub.manual_deductions) +
                          Number(stub.tax_deduction) +
                          Number(stub.uif_contribution)
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>Net Pay</span>
                      <span>R{Number(stub.net_pay).toFixed(2)}</span>
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

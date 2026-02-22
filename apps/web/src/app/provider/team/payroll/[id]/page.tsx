"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, DollarSign, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";

interface PayRunItem {
  id: string;
  staff_id: string;
  staff_name: string;
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

interface PayRunDetail {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  approved_at?: string;
  items: PayRunItem[];
}

export default function PayrollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [payRun, setPayRun] = useState<PayRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  useEffect(() => {
    if (id) loadPayRun();
  }, [id]);

  const loadPayRun = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PayRunDetail }>(`/api/provider/pay-runs/${id}`);
      setPayRun((response as any)?.data ?? response);
    } catch (err) {
      console.error("Failed to load pay run:", err);
      toast.error("Failed to load pay run");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsApproving(true);
      await fetcher.post(`/api/provider/pay-runs/${id}/approve`, {});
      toast.success("Pay run approved");
      loadPayRun();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve");
    } finally {
      setIsApproving(false);
    }
  };

  const handleMarkPaid = async () => {
    try {
      setIsMarkingPaid(true);
      await fetcher.post(`/api/provider/pay-runs/${id}/mark-paid`, {});
      toast.success("Pay run marked as paid");
      loadPayRun();
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark as paid");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "draft") return "bg-amber-100 text-amber-800";
    if (s === "approved") return "bg-blue-100 text-blue-800";
    if (s === "paid") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const totalNet = payRun?.items?.reduce((s, i) => s + Number(i.net_pay || 0), 0) ?? 0;
  const totalGross = payRun?.items?.reduce((s, i) => s + Number(i.gross_pay || 0), 0) ?? 0;

  if (isLoading || !payRun) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pay Run" />
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6">
      <PageHeader
        title={`Pay Run: ${format(new Date(payRun.pay_period_start), "MMM d")} – ${format(new Date(payRun.pay_period_end), "MMM d, yyyy")}`}
        subtitle={`Status: ${payRun.status}`}
        breadcrumbs={[
          { label: "Team", href: "/provider/team/members" },
          { label: "Payroll", href: "/provider/team/payroll" },
          { label: "Pay Run" },
        ]}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" onClick={() => router.push("/provider/team/payroll")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Badge className={statusColor(payRun.status)}>{payRun.status}</Badge>
        {payRun.status === "draft" && (
          <Button onClick={handleApprove} disabled={isApproving} className="bg-blue-600 hover:bg-blue-700">
            {isApproving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Approve
          </Button>
        )}
        {payRun.status === "approved" && (
          <Button onClick={handleMarkPaid} disabled={isMarkingPaid} className="bg-green-600 hover:bg-green-700">
            {isMarkingPaid ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
            Mark as Paid
          </Button>
        )}
      </div>

      <SectionCard>
        <h3 className="font-semibold mb-4">Pay Run Items</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Hourly</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payRun.items || []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.staff_name}</TableCell>
                  <TableCell className="text-right">R{Number(item.commission_amount || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">R{Number(item.hourly_amount || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">R{Number(item.salary_amount || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">R{Number(item.tips_amount || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    R{(Number(item.manual_deductions || 0) + Number(item.tax_deduction || 0) + Number(item.uif_contribution || 0)).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">R{Number(item.net_pay || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 pt-4 border-t flex justify-end">
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Gross: R{totalGross.toFixed(2)}</p>
            <p className="font-semibold">Total Net: R{totalNet.toFixed(2)}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, DollarSign, Loader2, Download, Save } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";

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

function isPayrollOwnerRole(role: string | null | undefined): boolean {
  return role === "provider_owner" || role === "superadmin";
}

/** Tax/UIF auto-calculation may be added later; owners enter values manually today. */
function ManualEntryHint() {
  return (
    <Badge variant="secondary" className="ml-1 align-middle text-[10px] font-normal normal-case">
      Manual
    </Badge>
  );
}

function parseMoney(s: string): number {
  const n = parseFloat(String(s).replace(",", ".").trim());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function computeNetPreview(item: PayRunItem, manualInput: string | undefined): number {
  const gross = Number(item.gross_pay || 0);
  const manual = parseMoney(manualInput ?? String(item.manual_deductions ?? 0));
  const tax = Number(item.tax_deduction || 0);
  const uif = Number(item.uif_contribution || 0);
  return Math.max(0, gross - manual - tax - uif);
}

export default function PayrollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const { format: fmt } = useProviderMoneyFormat();
  const isOwner = isPayrollOwnerRole(role);
  const id = params?.id as string;
  const [payRun, setPayRun] = useState<PayRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lineEdits, setLineEdits] = useState<Record<string, { manual_deductions: string; notes: string }>>({});

  const loadPayRun = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PayRunDetail }>(`/api/provider/pay-runs/${id}`, {
        staleTimeMs: 0,
      });
      const payload = response as { data?: PayRunDetail };
      setPayRun(payload?.data ?? null);
    } catch (err) {
      console.error("Failed to load pay run:", err);
      toast.error("Failed to load pay run");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadPayRun();
  }, [id, loadPayRun]);

  useEffect(() => {
    if (!payRun?.items?.length) {
      setLineEdits({});
      return;
    }
    const next: Record<string, { manual_deductions: string; notes: string }> = {};
    for (const i of payRun.items) {
      next[i.id] = {
        manual_deductions: String(Number(i.manual_deductions ?? 0)),
        notes: i.notes ?? "",
      };
    }
    setLineEdits(next);
  }, [payRun]);

  const canEditDraft = payRun?.status === "draft" && isOwner;

  const handleApprove = async () => {
    try {
      setIsApproving(true);
      await fetcher.post(`/api/provider/pay-runs/${id}/approve`, {});
      toast.success("Pay run approved");
      loadPayRun();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleSaveDraftLines = async () => {
    if (!payRun || payRun.status !== "draft" || !isOwner) return;
    try {
      setIsSavingDraft(true);
      const items = payRun.items.map((i) => ({
        item_id: i.id,
        manual_deductions: parseMoney(lineEdits[i.id]?.manual_deductions ?? "0"),
        notes: lineEdits[i.id]?.notes ?? "",
      }));
      await fetcher.patch(`/api/provider/pay-runs/${id}`, { items });
      toast.success("Draft line items saved");
      await loadPayRun();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save line items");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "draft") return "bg-amber-100 text-amber-800";
    if (s === "approved") return "bg-blue-100 text-blue-800";
    if (s === "paid") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-800";
  };

  const totalGross = payRun?.items?.reduce((s, i) => s + Number(i.gross_pay || 0), 0) ?? 0;

  const totalNet = useMemo(() => {
    if (!payRun?.items?.length) return 0;
    if (canEditDraft) {
      return payRun.items.reduce((s, i) => s + computeNetPreview(i, lineEdits[i.id]?.manual_deductions), 0);
    }
    return payRun.items.reduce((s, i) => s + Number(i.net_pay || 0), 0);
  }, [payRun, canEditDraft, lineEdits]);

  const handleExportCSV = () => {
    if (!payRun) return;
    const headers = [
      "Staff",
      "Gross Pay",
      "Commission",
      "Hourly",
      "Salary",
      "Tips",
      "Manual Deductions",
      "Tax",
      "UIF",
      "Net Pay",
      "Notes",
    ];
    const rows = (payRun.items || []).map((i) => [
      i.staff_name,
      Number(i.gross_pay || 0).toFixed(2),
      Number(i.commission_amount || 0).toFixed(2),
      Number(i.hourly_amount || 0).toFixed(2),
      Number(i.salary_amount || 0).toFixed(2),
      Number(i.tips_amount || 0).toFixed(2),
      Number(i.manual_deductions || 0).toFixed(2),
      Number(i.tax_deduction || 0).toFixed(2),
      Number(i.uif_contribution || 0).toFixed(2),
      Number(i.net_pay || 0).toFixed(2),
      (i.notes || "").replace(/"/g, '""'),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pay-run-${payRun.pay_period_start}-${payRun.pay_period_end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        subtitle={
          isOwner
            ? `Status: ${payRun.status}`
            : `Status: ${payRun.status} · View only — only the business owner can edit drafts, approve, or mark paid`
        }
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
        {payRun.status === "draft" && isOwner && (
          <Button onClick={handleApprove} disabled={isApproving} className="bg-blue-600 hover:bg-blue-700">
            {isApproving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Approve
          </Button>
        )}
        {payRun.status === "approved" && isOwner && (
          <Button onClick={handleMarkPaid} disabled={isMarkingPaid} className="bg-green-600 hover:bg-green-700">
            {isMarkingPaid ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
            Mark as Paid
          </Button>
        )}
        {canEditDraft && (
          <Button variant="secondary" onClick={handleSaveDraftLines} disabled={isSavingDraft}>
            {isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save draft line items
          </Button>
        )}
        <Button variant="outline" onClick={handleExportCSV}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <SectionCard>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
          <h3 className="font-semibold">Pay run items</h3>
          <p className="text-sm text-gray-600 max-w-xl">
            VAT / PAYE and UIF are shown for reference and stay at R0 until automation ships.
            <ManualEntryHint /> Use <strong>Manual deductions</strong> for other withholdings while this run is in draft.
          </p>
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-3">
          {(payRun.items || []).map((item) => {
            const manualStr = lineEdits[item.id]?.manual_deductions ?? String(item.manual_deductions ?? 0);
            const previewNet = computeNetPreview(item, manualStr);
            const tax = Number(item.tax_deduction || 0);
            const uif = Number(item.uif_contribution || 0);
            const deductionsTotal = parseMoney(manualStr) + tax + uif;
            return (
              <div key={item.id} className="rounded-lg border bg-white p-4 space-y-3">
                <p className="font-semibold text-gray-900">{item.staff_name}</p>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-xs text-gray-500">Commission</span>
                    <p className="text-gray-900">{fmt(Number(item.commission_amount || 0))}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Hourly</span>
                    <p className="text-gray-900">{fmt(Number(item.hourly_amount || 0))}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Salary</span>
                    <p className="text-gray-900">{fmt(Number(item.salary_amount || 0))}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Tips</span>
                    <p className="text-gray-900">{fmt(Number(item.tips_amount || 0))}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">Manual deductions</span>
                    {canEditDraft ? (
                      <Input
                        inputMode="decimal"
                        className="h-9 w-28 text-right"
                        value={manualStr}
                        onChange={(e) =>
                          setLineEdits((prev) => ({
                            ...prev,
                            [item.id]: {
                              manual_deductions: e.target.value,
                              notes: prev[item.id]?.notes ?? item.notes ?? "",
                            },
                          }))
                        }
                      />
                    ) : (
                      <span className="text-gray-900">{fmt(parseMoney(manualStr))}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <span className="text-xs text-gray-500">
                        Tax (VAT/PAYE)
                        <ManualEntryHint />
                      </span>
                      <p className="text-gray-700">{fmt(tax)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">
                        UIF
                        <ManualEntryHint />
                      </span>
                      <p className="text-gray-700">{fmt(uif)}</p>
                    </div>
                  </div>
                  {canEditDraft && (
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">Notes</span>
                      <Textarea
                        rows={2}
                        className="text-sm"
                        value={lineEdits[item.id]?.notes ?? ""}
                        onChange={(e) =>
                          setLineEdits((prev) => ({
                            ...prev,
                            [item.id]: {
                              manual_deductions: prev[item.id]?.manual_deductions ?? String(item.manual_deductions ?? 0),
                              notes: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  )}
                  {!canEditDraft && item.notes ? (
                    <div>
                      <span className="text-xs text-gray-500">Notes</span>
                      <p className="text-gray-800 text-sm">{item.notes}</p>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between pt-2 border-t text-sm">
                  <div>
                    <span className="text-xs text-gray-500">Total deductions</span>
                    <p className="text-red-600">−{fmt(deductionsTotal)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Net pay</span>
                    <p className="font-semibold text-gray-900">{fmt(canEditDraft ? previewNet : Number(item.net_pay || 0))}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Hourly</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Manual ded.</TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  Tax (VAT/PAYE)
                  <ManualEntryHint />
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  UIF
                  <ManualEntryHint />
                </TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payRun.items || []).map((item) => {
                const manualStr = lineEdits[item.id]?.manual_deductions ?? String(item.manual_deductions ?? 0);
                const previewNet = computeNetPreview(item, manualStr);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.staff_name}</TableCell>
                    <TableCell className="text-right">{fmt(Number(item.commission_amount || 0))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(item.hourly_amount || 0))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(item.salary_amount || 0))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(item.tips_amount || 0))}</TableCell>
                    <TableCell className="text-right">
                      {canEditDraft ? (
                        <Input
                          inputMode="decimal"
                          className="h-8 w-24 ml-auto text-right"
                          value={manualStr}
                          onChange={(e) =>
                            setLineEdits((prev) => ({
                              ...prev,
                              [item.id]: {
                                manual_deductions: e.target.value,
                                notes: prev[item.id]?.notes ?? item.notes ?? "",
                              },
                            }))
                          }
                        />
                      ) : (
                        fmt(parseMoney(manualStr))
                      )}
                    </TableCell>
                    <TableCell className="text-right text-gray-700">{fmt(Number(item.tax_deduction || 0))}</TableCell>
                    <TableCell className="text-right text-gray-700">{fmt(Number(item.uif_contribution || 0))}</TableCell>
                    <TableCell className="min-w-[140px] max-w-[220px]">
                      {canEditDraft ? (
                        <Textarea
                          rows={2}
                          className="text-sm min-h-[52px]"
                          value={lineEdits[item.id]?.notes ?? ""}
                          onChange={(e) =>
                            setLineEdits((prev) => ({
                              ...prev,
                              [item.id]: {
                                manual_deductions: prev[item.id]?.manual_deductions ?? String(item.manual_deductions ?? 0),
                                notes: e.target.value,
                              },
                            }))
                          }
                        />
                      ) : (
                        <span className="text-sm text-gray-800">{item.notes || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmt(canEditDraft ? previewNet : Number(item.net_pay || 0))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 pt-4 border-t flex justify-end">
          <div className="text-right">
            <p className="text-sm text-gray-600">Total gross: {fmt(totalGross)}</p>
            <p className="font-semibold">Total net: {fmt(totalNet)}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

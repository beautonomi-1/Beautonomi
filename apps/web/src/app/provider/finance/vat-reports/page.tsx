"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Download, AlertCircle, CheckCircle2, Clock, FileText } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VATReport {
  period_start: string;
  period_end: string;
  deadline_date: string;
  period_label: string;
  vat_collected: number;
  vat_collected_formatted: string;
  transaction_count: number;
  transactions: Array<{
    id: string;
    amount: number;
    booking_number: string;
    booking_date: string;
    description: string;
  }>;
  reminder_sent: {
    sent_at: string;
    days_before_deadline: number;
  } | null;
  days_until_deadline: number;
  is_overdue: boolean;
  status: 'overdue' | 'due_soon' | 'upcoming';
  remitted_to_sars: boolean;
  remitted_at: string | null;
  reminder_id: string | null; // ID of the reminder record for marking as remitted
}

interface VATReportsData {
  reports: VATReport[];
  provider: {
    vat_number: string | null;
    is_vat_registered: boolean;
  };
  year: number;
  message?: string;
}

export default function VATReportsPage() {
  const [data, setData] = useState<VATReportsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadReports();
    // Check for upcoming VAT reminders on page load (on-demand, no cron needed)
    checkVATReminders();
  }, [selectedYear]);

  const checkVATReminders = async () => {
    // This is a lightweight check that runs when the page loads
    // It only checks if reminders should be shown, doesn't send them automatically
    // Providers can see reminders in the UI and choose to act on them
    try {
      // Silently check - don't show errors to user
      await fetcher.get("/api/provider/finance/vat-reports/check-reminders").catch(() => {});
    } catch {
      // Ignore errors - this is a background check
    }
  };

  const loadReports = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<VATReportsData>(
        `/api/provider/finance/vat-reports?year=${selectedYear}`
      );
      setData(response);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load VAT reports";
      setError(errorMessage);
      console.error("Error loading VAT reports:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRemitted = async (report: VATReport) => {
    if (!report.reminder_id) {
      toast.error("Unable to mark as remitted. Please refresh the page.");
      return;
    }

    try {
      await fetcher.patch(`/api/provider/finance/vat-reports/${report.reminder_id}/mark-remitted`, {
        period_start: report.period_start,
        period_end: report.period_end,
      });
      toast.success("Marked as remitted to SARS");
      loadReports(); // Reload to update status
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to mark as remitted";
      toast.error(errorMessage);
    }
  };

  const exportReport = (report: VATReport) => {
    // Create CSV content
    const csvRows = [
      ['VAT Remittance Report', ''],
      ['Period', report.period_label],
      ['Period Start', report.period_start],
      ['Period End', report.period_end],
      ['Deadline', report.deadline_date],
      ['VAT Collected', report.vat_collected_formatted],
      ['Transaction Count', report.transaction_count.toString()],
      [''],
      ['Booking Number', 'Date', 'VAT Amount', 'Description'],
      ...report.transactions.map(t => [
        t.booking_number,
        new Date(t.booking_date).toLocaleDateString('en-ZA'),
        `R${t.amount.toFixed(2)}`,
        t.description || ''
      ])
    ];

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `vat-report-${report.period_start}-${report.period_end}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success("VAT report exported successfully");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading VAT reports..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load VAT reports"
          description={error || "An error occurred while loading VAT reports"}
          action={{
            label: "Try Again",
            onClick: loadReports,
          }}
        />
      </div>
    );
  }

  if (!data.provider.is_vat_registered) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-white border rounded-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">VAT Reports Not Available</h2>
          <p className="text-gray-600 mb-4">
            You are not VAT registered. VAT reports are only available for VAT-registered providers.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            If you need to register for VAT, please visit{" "}
            <a
              href="https://www.sars.gov.za/individuals/tax-types/value-added-tax-vat/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FF0077] hover:underline"
            >
              SARS website
            </a>
            . VAT registration is mandatory for businesses with annual turnover of R1 million or more.
          </p>
          <Button
            onClick={() => window.location.href = "/provider/settings/sales/taxes"}
            className="bg-[#FF0077] hover:bg-[#D60565]"
          >
            Update VAT Registration Status
          </Button>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2">VAT Reports</h1>
            <p className="text-gray-600">
              Bi-monthly VAT reports for SARS submission
              {data.provider.vat_number && (
                <span className="ml-2 text-sm">• VAT Number: {data.provider.vat_number}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {data.reports.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No VAT Reports Available</h2>
            <p className="text-gray-600">
              No VAT transactions found for {selectedYear}. VAT reports will appear here once you have bookings with VAT collected.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.reports.map((report, index) => (
              <div
                key={index}
                className={`bg-white border rounded-lg p-6 ${
                  report.is_overdue
                    ? "border-red-300 bg-red-50"
                    : report.status === "due_soon"
                    ? "border-yellow-300 bg-yellow-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">{report.period_label}</h3>
                      {report.is_overdue ? (
                        <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          Overdue
                        </span>
                      ) : report.status === "due_soon" ? (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Due Soon
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          Upcoming
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        <strong>Period:</strong> {new Date(report.period_start).toLocaleDateString('en-ZA')} - {new Date(report.period_end).toLocaleDateString('en-ZA')}
                      </p>
                      <p>
                        <strong>Deadline:</strong> {new Date(report.deadline_date).toLocaleDateString('en-ZA', { 
                          day: 'numeric', 
                          month: 'long', 
                          year: 'numeric' 
                        })}
                        {report.days_until_deadline > 0 && (
                          <span className="ml-2">
                            ({report.days_until_deadline} {report.days_until_deadline === 1 ? 'day' : 'days'} remaining)
                          </span>
                        )}
                      </p>
                      {report.reminder_sent && (
                        <p className="text-xs text-gray-500">
                          Reminder sent {new Date(report.reminder_sent.sent_at).toLocaleDateString('en-ZA')} 
                          ({report.reminder_sent.days_before_deadline} days before deadline)
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-[#FF0077] mb-1">
                      {report.vat_collected_formatted}
                    </div>
                    <p className="text-sm text-gray-600">
                      {report.transaction_count} {report.transaction_count === 1 ? 'transaction' : 'transactions'}
                    </p>
                  </div>
                </div>

                {report.transactions.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Transaction Details</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportReport(report)}
                        className="flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3">Booking #</th>
                            <th className="text-left py-2 px-3">Date</th>
                            <th className="text-right py-2 px-3">VAT Amount</th>
                            <th className="text-left py-2 px-3">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.transactions.map((transaction) => (
                            <tr key={transaction.id} className="border-b">
                              <td className="py-2 px-3">{transaction.booking_number}</td>
                              <td className="py-2 px-3">
                                {new Date(transaction.booking_date).toLocaleDateString('en-ZA')}
                              </td>
                              <td className="text-right py-2 px-3 font-medium">
                                R{transaction.amount.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-gray-600">
                                {transaction.description || 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t">
                  {report.remitted_to_sars ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-800 font-medium mb-1">
                            ✓ Remitted to SARS
                          </p>
                          <p className="text-xs text-green-700">
                            Confirmed on {report.remitted_at ? new Date(report.remitted_at).toLocaleDateString('en-ZA', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : 'N/A'}
                          </p>
                        </div>
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="mb-3">
                        <p className="text-sm text-blue-800">
                          <strong>Next Steps:</strong> Remit {report.vat_collected_formatted} to SARS by{" "}
                          {new Date(report.deadline_date).toLocaleDateString('en-ZA', { 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric' 
                          })}.{" "}
                          <a
                            href="https://www.sars.gov.za/individuals/tax-types/value-added-tax-vat/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-medium"
                          >
                            Submit via SARS eFiling →
                          </a>
                        </p>
                      </div>
                      <Button
                        onClick={() => markAsRemitted(report)}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark as Remitted to SARS
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, CreditCard, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import type { AdminYocoReconciliationResponse } from "@/app/api/admin/reports/yoco-reconciliation/route";

export default function AdminYocoReconciliationPage() {
  const [data, setData] = useState<AdminYocoReconciliationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(subDays(new Date(), 30).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [providerId, setProviderId] = useState("");

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("from", new Date(from).toISOString());
      params.set("to", new Date(to + "T23:59:59").toISOString());
      if (providerId.trim()) params.set("provider_id", providerId.trim());

      const response = await fetcher.get<{ data: AdminYocoReconciliationResponse }>(
        `/api/admin/reports/yoco-reconciliation?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once on mount

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Yoco reconciliation (admin)</h1>
          <p className="text-sm text-gray-600 mt-1">
            Compare Yoco payments with booking payments across providers. Use to debug sync issues.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40 mt-1"
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40 mt-1"
            />
          </div>
          <div>
            <Label htmlFor="provider_id">Provider ID (optional)</Label>
            <Input
              id="provider_id"
              placeholder="UUID"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-64 mt-1 font-mono text-sm"
            />
          </div>
          <Button onClick={loadReport} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Load
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>
        )}

        {isLoading && (
          <div className="py-12 text-center text-gray-500">Loading…</div>
        )}

        {!isLoading && data && (
          <>
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.summary.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">With booking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.summary.with_booking}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" /> Synced
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.summary.synced}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-amber-600" /> Not synced
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.summary.not_synced}</div>
                </CardContent>
              </Card>
            </div>

            {data.summary.not_synced > 0 && (
              <Card className="mb-6 border-amber-200 bg-amber-50/50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      {data.summary.not_synced} payment(s) linked to a booking are not synced to booking_payments.
                      Check webhook delivery or manual reconciliation.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {providerId ? `Filtered by provider ${providerId}` : "All providers"}
                </p>
              </CardHeader>
              <CardContent>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No Yoco payments in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Date</th>
                          <th className="text-left py-2 font-medium">Provider</th>
                          <th className="text-left py-2 font-medium">Yoco ID</th>
                          <th className="text-right py-2 font-medium">Amount</th>
                          <th className="text-left py-2 font-medium">Status</th>
                          <th className="text-left py-2 font-medium">Booking</th>
                          <th className="text-left py-2 font-medium">Synced</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((p) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2">{format(new Date(p.created_at), "MMM d, yyyy HH:mm")}</td>
                            <td className="py-2">
                              <span className="text-muted-foreground font-mono text-xs">{p.provider_id.slice(0, 8)}…</span>
                              {p.provider_name && (
                                <span className="ml-1 text-gray-700">{p.provider_name}</span>
                              )}
                            </td>
                            <td className="py-2 font-mono text-xs">{p.yoco_payment_id}</td>
                            <td className="py-2 text-right">
                              {(p.amount / 100).toFixed(2)} {p.currency}
                            </td>
                            <td className="py-2">{p.status}</td>
                            <td className="py-2">{p.appointment_id ? "Yes" : "—"}</td>
                            <td className="py-2">
                              {p.appointment_id ? (
                                p.booking_synced ? (
                                  <span className="text-green-600">Synced</span>
                                ) : (
                                  <span className="text-amber-600">Not synced</span>
                                )
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RoleGuard>
  );
}

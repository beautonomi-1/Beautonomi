"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/provider/SectionCard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

type PaystackTerminal = {
  id: string;
  name: string;
  display_name?: string | null;
  terminal_code: string;
  status: string;
  active: boolean;
  currency: string;
  payment_link?: string | null;
  terminal_url?: string | null;
  qr_url?: string | null;
  poster_url?: string | null;
  asset_status?: string | null;
  destination_status?: string | null;
  notification_whatsapp?: string | null;
  last_payment_at?: string | null;
};

type PaystackTerminalPayment = {
  id: string;
  paystack_reference: string;
  paid_amount: number;
  expected_amount?: number | null;
  currency: string;
  allocation_status: string;
  amount_match_status: string;
  customer_reference?: string | null;
  suggested_entity_type?: string | null;
  suggested_entity_id?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  created_at: string;
};

export default function PaystackTerminalSettingsPage() {
  const [terminals, setTerminals] = useState<PaystackTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaystackTerminalPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [creating, setCreating] = useState(false);
  const [requestingAssetsId, setRequestingAssetsId] = useState<string | null>(null);
  const [reviewPayment, setReviewPayment] = useState<PaystackTerminalPayment | null>(null);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);

  async function loadTerminals() {
    setLoading(true);
    try {
      const response = await fetch("/api/provider/paystack/virtual-terminals");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to load terminals");
      setTerminals(payload?.data?.terminals ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load terminals");
    } finally {
      setLoading(false);
    }
  }

  async function loadPayments() {
    setLoadingPayments(true);
    try {
      const response = await fetch("/api/provider/paystack/terminal-payments?limit=10");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to load terminal payments");
      const rows = payload?.data?.items ?? [];
      setPayments(rows);
      const actionable = rows.find((payment: PaystackTerminalPayment) =>
        ["suggested", "unmatched", "admin_review"].includes(payment.allocation_status),
      );
      setReviewPayment((current) => current ?? actionable ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load terminal payments");
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    void loadTerminals();
    void loadPayments();
    const interval = window.setInterval(() => {
      void loadPayments();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  async function requestTerminalSetup() {
    setCreating(true);
    try {
      const response = await fetch("/api/provider/paystack/virtual-terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to request terminal setup");
      toast.success(payload?.data?.message || "Beautonomi Ops has been notified.");
      await loadTerminals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request terminal setup");
    } finally {
      setCreating(false);
    }
  }

  async function requestBrandedAssets(id: string) {
    setRequestingAssetsId(id);
    try {
      const response = await fetch(`/api/provider/paystack/virtual-terminals/${id}/request-assets`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to request branded assets");
      toast.success(payload?.data?.message || "Beautonomi Ops has been notified.");
      await loadTerminals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request branded assets");
    } finally {
      setRequestingAssetsId(null);
    }
  }

  function assetLabel(status?: string | null) {
    if (status === "ready") return "Ready";
    if (status === "link_ready") return "Link ready · QR/poster in progress";
    if (status === "poster_ready") return "Poster ready · link needed";
    return "Setup needed";
  }

  function amountMatchLabel(status?: string | null) {
    if (status === "exact_match") return "Amount matches";
    if (status === "partial_payment") return "Partial payment";
    if (status === "overpayment") return "Overpayment";
    if (status === "currency_mismatch") return "Currency mismatch";
    if (status === "ambiguous_amount_match") return "Ambiguous amount match";
    if (status === "amount_only_match") return "Amount-only match";
    return "Needs review";
  }

  async function allocatePayment(payment: PaystackTerminalPayment, action: "confirm" | "decline" | "admin_review") {
    setAllocatingPaymentId(payment.id);
    try {
      let body: Record<string, unknown>;
      if (action === "confirm") {
        if (!payment.suggested_entity_type || !payment.suggested_entity_id) {
          toast.error("No suggested target was found. Send this payment to admin review instead.");
          return;
        }
        body = {
          action,
          entity_type: payment.suggested_entity_type,
          entity_id: payment.suggested_entity_id,
        };
      } else if (action === "decline") {
        body = { action, reason: "Provider marked the booking/order note or match as incorrect." };
      } else {
        body = { action, reason: "Provider requested admin review from web." };
      }
      const response = await fetch(`/api/provider/paystack/terminal-payments/${payment.id}/allocation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Failed to update allocation");
      toast.success(action === "confirm" ? "Payment allocated" : "Payment sent for review");
      setReviewPayment(null);
      await loadPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update allocation");
    } finally {
      setAllocatingPaymentId(null);
    }
  }

  async function copyTerminalCode(code: string) {
    await navigator.clipboard.writeText(code);
    toast.success("Terminal code copied");
  }

  async function copyPaymentLink(link: string) {
    await navigator.clipboard.writeText(link);
    toast.success("Payment link copied");
  }

  function printPoster(url: string) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) toast.error("Could not open poster. Check your popup blocker.");
  }

  return (
    <SettingsDetailLayout
      title="Paystack Terminal"
      description="Use admin-provisioned Paystack Virtual Terminals for in-person payments. Payments are verified by Paystack, reviewed in your payment inbox, and become payoutable after manual allocation and holds."
      backHref="/provider/settings"
    >
      <div className="space-y-6">
        <Alert>
          <AlertDescription>
            Paystack sends WhatsApp alerts to the configured destination number, but Beautonomi maps payments by the Paystack terminal code. Once a Paystack payment is recorded by webhook or admin reconciliation, it appears here for manual allocation.
          </AlertDescription>
        </Alert>

        <SectionCard>
          <h2 className="text-lg font-semibold">Request terminal setup</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Beautonomi Ops creates or fetches your Virtual Terminal in Paystack, then imports the Paystack-generated code, payment link, QR, and poster here.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Once imported, you can share the Paystack payment link. Customer payments arrive with Paystack-generated references and are manually allocated in the payment inbox.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button onClick={requestTerminalSetup} disabled={creating}>
              {creating ? "Requesting..." : "Request Paystack Terminal setup"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Terminals</h2>
              <p className="text-sm text-muted-foreground">
                Use these terminal codes for QR/link collection and reconciliation.
              </p>
            </div>
            <Button variant="outline" onClick={loadTerminals} disabled={loading}>
              Refresh
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading terminals...</p>
            ) : terminals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Paystack Terminals yet.</p>
            ) : (
              terminals.map((terminal) => (
                <div key={terminal.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{terminal.display_name || terminal.name}</h3>
                        <Badge variant={terminal.active ? "default" : "secondary"}>
                          {terminal.status}
                        </Badge>
                        <Badge variant={terminal.asset_status === "ready" ? "default" : "outline"}>
                          {assetLabel(terminal.asset_status)}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-sm text-muted-foreground">
                        {terminal.terminal_code}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Currency: {terminal.currency}
                        {terminal.last_payment_at
                          ? ` · Last payment: ${new Date(terminal.last_payment_at).toLocaleString()}`
                          : ""}
                      </p>
                      {terminal.notification_whatsapp ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Payment notifications sent to WhatsApp ending{" "}
                          {terminal.notification_whatsapp.replace(/\D/g, "").slice(-4)}
                        </p>
                      ) : null}
                      {terminal.asset_status !== "ready" ? (
                        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Ops still needs to add or refresh Paystack-generated assets before this terminal is fully ready.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void copyTerminalCode(terminal.terminal_code)}
                      >
                        Copy code
                      </Button>
                      {terminal.payment_link || terminal.terminal_url ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => void copyPaymentLink(terminal.payment_link ?? terminal.terminal_url ?? "")}
                          >
                            Copy link
                          </Button>
                          <Button asChild variant="outline">
                            <a href={terminal.payment_link ?? terminal.terminal_url ?? "#"} target="_blank" rel="noreferrer">
                              Visit link
                            </a>
                          </Button>
                        </>
                      ) : null}
                      {terminal.qr_url ? (
                        <Button asChild variant="outline">
                          <a href={terminal.qr_url} target="_blank" rel="noreferrer">
                            Show QR
                          </a>
                        </Button>
                      ) : null}
                      {terminal.poster_url ? (
                        <>
                          <Button asChild variant="outline">
                            <a href={terminal.poster_url} download target="_blank" rel="noreferrer">
                              Download poster
                            </a>
                          </Button>
                          <Button variant="outline" onClick={() => printPoster(terminal.poster_url ?? "")}>
                            Print poster
                          </Button>
                        </>
                      ) : null}
                      {terminal.asset_status !== "ready" ? (
                        <Button
                          variant="outline"
                          onClick={() => void requestBrandedAssets(terminal.id)}
                          disabled={requestingAssetsId === terminal.id}
                        >
                          {requestingAssetsId === terminal.id ? "Requesting..." : "Request branded QR/poster"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Payment inbox</h2>
              <p className="text-sm text-muted-foreground">
                Paystack verifies these payments and generates the transaction references. Allocate each payment to the correct booking, sale, or order.
              </p>
            </div>
            <Button variant="outline" onClick={loadPayments} disabled={loadingPayments}>
              Refresh
            </Button>
          </div>

          {reviewPayment ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-emerald-950">Payment received</h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    Check the amount and any booking/order note before choosing where to allocate this Paystack-verified payment.
                  </p>
                  <p className="mt-3 text-2xl font-bold text-gray-900">
                    {reviewPayment.currency} {Number(reviewPayment.paid_amount ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-600">
                    Expected:{" "}
                    {reviewPayment.expected_amount != null
                      ? `${reviewPayment.currency} ${Number(reviewPayment.expected_amount).toFixed(2)}`
                      : "No expected amount"}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-emerald-800">
                    {amountMatchLabel(reviewPayment.amount_match_status)} · {reviewPayment.amount_match_status}
                  </p>
                  <p className="mt-2 font-mono text-xs text-gray-600">Paystack ref: {reviewPayment.paystack_reference}</p>
                  <p className="text-xs text-gray-600">Booking/order note: {reviewPayment.customer_reference || "Not supplied"}</p>
                  <p className="text-xs text-gray-600">
                    Suggested target:{" "}
                    {reviewPayment.suggested_entity_type && reviewPayment.suggested_entity_id
                      ? `${reviewPayment.suggested_entity_type} ${reviewPayment.suggested_entity_id.slice(0, 8)}...`
                      : "No confident match"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void allocatePayment(reviewPayment, "confirm")}
                    disabled={allocatingPaymentId === reviewPayment.id || !reviewPayment.suggested_entity_id}
                  >
                    Approve match
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void allocatePayment(reviewPayment, "admin_review")}
                    disabled={allocatingPaymentId === reviewPayment.id}
                  >
                    Admin review
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void allocatePayment(reviewPayment, "decline")}
                    disabled={allocatingPaymentId === reviewPayment.id}
                  >
                    Incorrect ref
                  </Button>
                  <Button variant="ghost" onClick={() => setReviewPayment(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {loadingPayments ? (
              <p className="text-sm text-muted-foreground">Loading terminal payments...</p>
            ) : payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No terminal payments yet.</p>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {payment.currency} {Number(payment.paid_amount ?? 0).toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment.allocation_status} · {payment.amount_match_status}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{payment.paystack_reference}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Booking/order note: {payment.customer_reference || "Not supplied"}
                      </p>
                    </div>
                    {["suggested", "unmatched", "admin_review"].includes(payment.allocation_status) ? (
                      <Button variant="outline" onClick={() => setReviewPayment(payment)}>
                        Review payment
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </SettingsDetailLayout>
  );
}

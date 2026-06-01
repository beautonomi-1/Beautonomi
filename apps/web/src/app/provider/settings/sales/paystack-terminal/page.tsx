"use client";



import { useCallback, useEffect, useState } from "react";

import { SectionCard } from "@/components/provider/SectionCard";

import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { toast } from "sonner";

import { useConfigBundle, useFeatureFlag } from "@/providers/ConfigBundleProvider";

import { paystackTerminalErrorMessage } from "@/lib/payments/paystack-terminal-errors";

import { fetcher, FetchError } from "@/lib/http/fetcher";

import type { PaystackVirtualTerminalFeatureAccess } from "@/lib/subscriptions/feature-access";

import { Clock } from "lucide-react";



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



type PaystackTerminalSetupRequest = {

  id: string;

  status: string;

  requested_display_name?: string | null;

  request_notes?: string | null;

  rejection_reason?: string | null;

  destination_target?: string | null;

  support_ticket_id?: string | null;

  created_at: string;

};



type TerminalsResponse = {

  data?: {

    terminals?: PaystackTerminal[];

    setupRequests?: PaystackTerminalSetupRequest[];

    subscription?: PaystackVirtualTerminalFeatureAccess;

    canRequestSetup?: boolean;

  };

  error?: { message?: string; code?: string };

};



type PaymentsResponse = {

  data?: { items?: PaystackTerminalPayment[] };

  error?: { message?: string; code?: string };

};



function apiErrorMessage(error: unknown, fallback: string): string {

  if (error instanceof FetchError) {

    return paystackTerminalErrorMessage(error.message, error.code);

  }

  return error instanceof Error ? error.message : fallback;

}



export default function PaystackTerminalSettingsPage() {

  const { isLoading: bundleLoading } = useConfigBundle();

  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");

  const [terminals, setTerminals] = useState<PaystackTerminal[]>([]);

  const [setupRequests, setSetupRequests] = useState<PaystackTerminalSetupRequest[]>([]);

  const [canRequestSetup, setCanRequestSetup] = useState(true);

  const [loading, setLoading] = useState(true);

  const [payments, setPayments] = useState<PaystackTerminalPayment[]>([]);

  const [loadingPayments, setLoadingPayments] = useState(true);

  const [creating, setCreating] = useState(false);

  const [whatsapp, setWhatsapp] = useState("");

  const [requestingAssetsId, setRequestingAssetsId] = useState<string | null>(null);

  const [reviewPayment, setReviewPayment] = useState<PaystackTerminalPayment | null>(null);

  const [reviewDismissedId, setReviewDismissedId] = useState<string | null>(null);

  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);



  const loadTerminals = useCallback(async () => {

    setLoading(true);

    try {

      const payload = await fetcher.get<TerminalsResponse>(

        "/api/provider/paystack/virtual-terminals",

        { staleTimeMs: 0 },

      );

      if (payload?.error) {

        throw new Error(

          paystackTerminalErrorMessage(payload.error.message, payload.error.code),

        );

      }

      setTerminals(payload?.data?.terminals ?? []);

      setSetupRequests(payload?.data?.setupRequests ?? []);

      setCanRequestSetup(payload?.data?.canRequestSetup ?? payload?.data?.subscription?.enabled ?? true);

    } catch (error) {

      toast.error(apiErrorMessage(error, "Failed to load terminals"));

    } finally {

      setLoading(false);

    }

  }, []);



  const loadPayments = useCallback(async () => {

    setLoadingPayments(true);

    try {

      const payload = await fetcher.get<PaymentsResponse>(

        "/api/provider/paystack/terminal-payments?limit=10",

        { staleTimeMs: 0 },

      );

      if (payload?.error) {

        throw new Error(payload.error.message || "Failed to load terminal payments");

      }

      const rows = payload?.data?.items ?? [];

      setPayments(rows);

      const actionable = rows.find(

        (payment: PaystackTerminalPayment) =>

          payment.id !== reviewDismissedId &&

          ["suggested", "unmatched", "admin_review"].includes(payment.allocation_status),

      );

      setReviewPayment((current) => {

        if (current && current.id === reviewDismissedId) return null;

        return current ?? actionable ?? null;

      });

    } catch (error) {

      toast.error(apiErrorMessage(error, "Failed to load terminal payments"));

    } finally {

      setLoadingPayments(false);

    }

  }, [reviewDismissedId]);



  useEffect(() => {

    if (bundleLoading || !paystackTerminalEnabled) return;

    void loadTerminals();

    void loadPayments();

    const interval = window.setInterval(() => {

      void loadPayments();

    }, 15_000);

    return () => window.clearInterval(interval);

  }, [bundleLoading, paystackTerminalEnabled, loadTerminals, loadPayments]);



  async function requestTerminalSetup() {

    setCreating(true);

    try {

      const payload = await fetcher.post<{

        data?: { message?: string };

        error?: { message?: string; code?: string };

      }>("/api/provider/paystack/virtual-terminals", whatsapp.trim() ? { whatsapp: whatsapp.trim() } : {});

      if (payload?.error) {

        throw new Error(

          paystackTerminalErrorMessage(payload.error.message, payload.error.code),

        );

      }

      toast.success(payload?.data?.message || "Beautonomi Ops has been notified.");

      await loadTerminals();

    } catch (error) {

      toast.error(apiErrorMessage(error, "Failed to request terminal setup"));

    } finally {

      setCreating(false);

    }

  }



  async function requestBrandedAssets(id: string) {

    setRequestingAssetsId(id);

    try {

      const payload = await fetcher.post<{

        data?: { message?: string };

        error?: { message?: string; code?: string };

      }>(`/api/provider/paystack/virtual-terminals/${id}/request-assets`);

      if (payload?.error) {

        throw new Error(payload.error.message || "Failed to request branded assets");

      }

      toast.success(payload?.data?.message || "Beautonomi Ops has been notified.");

      await loadTerminals();

    } catch (error) {

      toast.error(apiErrorMessage(error, "Failed to request branded assets"));

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

      const payload = await fetcher.post<{

        data?: unknown;

        error?: { message?: string; code?: string };

      }>(`/api/provider/paystack/terminal-payments/${payment.id}/allocation`, body);

      if (payload?.error) {

        throw new Error(payload.error.message || "Failed to update allocation");

      }

      toast.success(action === "confirm" ? "Payment allocated" : "Payment sent for review");

      setReviewPayment(null);

      await loadPayments();

    } catch (error) {

      toast.error(apiErrorMessage(error, "Failed to update allocation"));

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



  function terminalQrSrc(terminal: PaystackTerminal): string | null {

    if (terminal.qr_url) return terminal.qr_url;

    const link = terminal.payment_link ?? terminal.terminal_url;

    return link
      ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(link)}`
      : null;

  }

  function printTerminalPoster(terminal: PaystackTerminal) {

    const qr = terminalQrSrc(terminal);

    const name = terminal.display_name || terminal.name || "Pay here";

    const link = terminal.payment_link ?? terminal.terminal_url ?? "";

    const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=1000");

    if (!win) {

      toast.error("Could not open the poster. Check your popup blocker.");

      return;

    }

    win.document.write(`<!doctype html><html><head><title>${name} — Pay here</title>

<meta name="viewport" content="width=device-width, initial-scale=1" />

<style>

  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}

  body{margin:0;padding:48px;text-align:center;color:#0f172a}

  h1{font-size:32px;margin:0 0 8px}

  p{font-size:18px;color:#334155;margin:6px 0}

  .qr{margin:32px auto;max-width:360px;width:100%}

  .qr img{width:100%;height:auto;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff}

  .code{font-family:monospace;font-size:20px;letter-spacing:1px;margin-top:8px}

  .link{font-size:14px;color:#2563eb;word-break:break-all;margin-top:8px}

  @media print{button{display:none}}

</style></head><body>

  <h1>${name}</h1>

  <p>Scan to pay with your phone</p>

  ${qr ? `<div class="qr"><img src="${qr}" alt="Payment QR code" /></div>` : "<p>QR code not available yet.</p>"}

  <p class="code">${terminal.terminal_code}</p>

  ${link ? `<p class="link">${link}</p>` : ""}

  <button onclick="window.print()" style="margin-top:24px;padding:12px 24px;font-size:16px;border-radius:8px;border:none;background:#0f172a;color:#fff;cursor:pointer">Print poster</button>

</body></html>`);

    win.document.close();

  }



  function dismissReview(paymentId: string) {

    setReviewDismissedId(paymentId);

    setReviewPayment(null);

  }



  const pendingRequests = setupRequests.filter(

    (request) => request.status === "requested" || request.status === "in_progress",

  );

  const rejectedRequest = setupRequests.find((request) => request.status === "rejected") ?? null;

  const hasPendingRequest = pendingRequests.length > 0;



  if (bundleLoading) {

    return (

      <SettingsDetailLayout

        title="Paystack Terminal"

        description="In-person QR and link payments that settle through Beautonomi payouts."

        backHref="/provider/settings"

      >

        <SectionCard>

          <p className="text-sm text-muted-foreground">Loading…</p>

        </SectionCard>

      </SettingsDetailLayout>

    );

  }



  if (!paystackTerminalEnabled) {

    return (

      <SettingsDetailLayout

        title="Paystack Terminal"

        description="In-person QR and link payments that settle through Beautonomi payouts."

        backHref="/provider/settings"

      >

        <SectionCard>

          <p className="text-sm text-muted-foreground">

            Paystack Terminal payments are not enabled for this market. Contact Beautonomi support if you believe this is an error.

          </p>

        </SectionCard>

      </SettingsDetailLayout>

    );

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



        {!canRequestSetup ? (

          <Alert variant="destructive">

            <AlertDescription>

              Your subscription plan does not include Paystack Terminal. Contact support or upgrade your plan to request terminal setup.

            </AlertDescription>

          </Alert>

        ) : null}



        {hasPendingRequest && terminals.length === 0 ? (

          <Alert className="border-amber-200 bg-amber-50">

            <Clock className="h-4 w-4 text-amber-800" />

            <AlertDescription className="text-amber-900">

              <span className="font-semibold">Setup request received.</span> Beautonomi Ops has been notified and will create your Paystack Virtual Terminal shortly. Your terminal, payment link, QR, and poster will appear here once ready.

              {pendingRequests[0]?.request_notes ? (

                <span className="mt-2 block text-sm text-amber-800">{pendingRequests[0].request_notes}</span>

              ) : null}

            </AlertDescription>

          </Alert>

        ) : null}



        {rejectedRequest && !hasPendingRequest ? (

          <Alert variant="destructive">

            <AlertDescription>

              <span className="font-semibold">Your last setup request needs changes.</span>

              {rejectedRequest.rejection_reason ? (

                <span className="mt-2 block text-sm">{rejectedRequest.rejection_reason}</span>

              ) : null}

              <span className="mt-2 block text-sm">

                Update your WhatsApp number below (international format, e.g. +27821234567) and submit a new request.

              </span>

              {rejectedRequest.support_ticket_id ? (

                <span className="mt-2 block text-sm">

                  Our team has opened a support conversation — check your email or the Beautonomi provider app to reply.

                </span>

              ) : null}

            </AlertDescription>

          </Alert>

        ) : null}

        <SectionCard>

          <h2 className="text-lg font-semibold">Request terminal setup</h2>

          <p className="mt-1 text-sm text-muted-foreground">

            Beautonomi Ops creates or fetches your Virtual Terminal in Paystack, then imports the Paystack-generated code, payment link, QR, and poster here.

          </p>

          <p className="mt-2 text-xs text-muted-foreground">

            Once imported, you can share the Paystack payment link. Customer payments arrive with Paystack-generated references and are manually allocated in the payment inbox.

          </p>

          <div className="mt-4 space-y-2">

            <label htmlFor="paystack-terminal-whatsapp" className="text-sm font-medium">

              WhatsApp number for payment notifications

            </label>

            <input

              id="paystack-terminal-whatsapp"

              type="tel"

              inputMode="tel"

              value={whatsapp}

              onChange={(event) => setWhatsapp(event.target.value)}

              placeholder="+27821234567"

              disabled={creating || hasPendingRequest || !canRequestSetup}

              className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"

            />

            <p className="text-xs text-muted-foreground">

              Use the international format. Leave blank to use the phone number on your provider profile.

            </p>

          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">

            <Button

              onClick={requestTerminalSetup}

              disabled={creating || hasPendingRequest || !canRequestSetup}

            >

              {creating

                ? "Requesting..."

                : hasPendingRequest

                  ? "Setup request pending"

                  : !canRequestSetup

                    ? "Not available on your plan"

                    : rejectedRequest

                      ? "Update & submit new request"

                      : "Request Paystack Terminal setup"}

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

            <Button variant="outline" onClick={() => void loadTerminals()} disabled={loading}>

              Refresh

            </Button>

          </div>



          <div className="mt-4 space-y-3">

            {loading ? (

              <p className="text-sm text-muted-foreground">Loading terminals...</p>

            ) : terminals.length === 0 ? (

              <p className="text-sm text-muted-foreground">

                {hasPendingRequest

                  ? "Your terminal will appear here once Ops has completed the setup."

                  : "No Paystack Terminals yet."}

              </p>

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

                      {(terminalQrSrc(terminal) || terminal.poster_url) ? (

                        <div className="mt-3 flex flex-wrap items-start gap-4">

                          {terminalQrSrc(terminal) ? (

                            <div className="flex flex-col items-center gap-1">

                              {/* eslint-disable-next-line @next/next/no-img-element */}

                              <img

                                src={terminalQrSrc(terminal) ?? undefined}

                                alt="Paystack Terminal QR code"

                                className="h-40 w-40 rounded-md border bg-white object-contain p-1"

                              />

                              <span className="text-[11px] text-muted-foreground">Customer scans to pay</span>

                            </div>

                          ) : null}

                          {terminal.poster_url ? (

                            <a href={terminal.poster_url} target="_blank" rel="noreferrer" className="block">

                              {/* eslint-disable-next-line @next/next/no-img-element */}

                              <img

                                src={terminal.poster_url}

                                alt="Paystack Terminal poster"

                                className="h-40 w-auto rounded-md border object-contain"

                              />

                              <span className="mt-1 block text-center text-[11px] text-muted-foreground">

                                Tap to view full poster

                              </span>

                            </a>

                          ) : null}

                        </div>

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

                        <Button asChild variant="outline">

                          <a href={terminal.poster_url} download target="_blank" rel="noreferrer">

                            Download poster

                          </a>

                        </Button>

                      ) : null}

                      {(terminal.payment_link || terminal.terminal_url || terminal.qr_url) ? (

                        <Button variant="outline" onClick={() => printTerminalPoster(terminal)}>

                          Print poster

                        </Button>

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

            <Button variant="outline" onClick={() => void loadPayments()} disabled={loadingPayments}>

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

                  <Button variant="ghost" onClick={() => dismissReview(reviewPayment.id)}>

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


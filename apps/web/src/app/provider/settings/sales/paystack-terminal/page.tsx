"use client";

import { useTranslation } from "@beautonomi/i18n";
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

import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";

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

  terminal?: { id?: string | null; name?: string | null; terminal_code?: string | null } | null;

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
  const { t } = useTranslation();

  const { isLoading: bundleLoading } = useConfigBundle();

  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");

  const [terminals, setTerminals] = useState<PaystackTerminal[]>([]);

  const [setupRequests, setSetupRequests] = useState<PaystackTerminalSetupRequest[]>([]);

  const [canRequestSetup, setCanRequestSetup] = useState(true);

  const [loading, setLoading] = useState(true);

  const [payments, setPayments] = useState<PaystackTerminalPayment[]>([]);

  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  const [loadingPayments, setLoadingPayments] = useState(true);

  const [creating, setCreating] = useState(false);

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

      const loadedTerminals = payload?.data?.terminals ?? [];

      setTerminals(loadedTerminals);

      // Default the inbox to the first (usually only) terminal so payments are ringfenced to it,
      // and keep the selection valid if the previously selected terminal disappears.
      setSelectedTerminalId((current) => {
        if (current && loadedTerminals.some((t) => t.id === current)) return current;
        return loadedTerminals[0]?.id ?? null;
      });

      setSetupRequests(payload?.data?.setupRequests ?? []);

      setCanRequestSetup(payload?.data?.canRequestSetup ?? payload?.data?.subscription?.enabled ?? true);

    } catch (error) {

      toast.error(apiErrorMessage(error, t("web.provider.settings.pages.sales/paystack-terminal.failedToLoadTerminals")));

    } finally {

      setLoading(false);

    }

  }, []);



  const loadPayments = useCallback(async () => {

    setLoadingPayments(true);

    try {

      const query = new URLSearchParams({ limit: "10" });

      if (selectedTerminalId) query.set("terminal_id", selectedTerminalId);

      const payload = await fetcher.get<PaymentsResponse>(

        `/api/provider/paystack/terminal-payments?${query.toString()}`,

        { staleTimeMs: 0 },

      );

      if (payload?.error) {

        throw new Error(payload.error.message || t("web.provider.settings.pages.sales/paystack-terminal.failedToLoadTerminalPayments"));

      }

      const rows = payload?.data?.items ?? [];

      setPayments(rows);

      // Do not auto-pop the review card on every poll (that made it impossible to dismiss while

      // other payments were pending). It opens only via "Review payment", the realtime alert, or

      // the notification deep link. We only refresh the currently open card's data here.

      setReviewPayment((current) => {

        if (!current) return null;

        if (current.id === reviewDismissedId) return null;

        return rows.find((payment) => payment.id === current.id) ?? current;

      });

    } catch (error) {

      toast.error(apiErrorMessage(error, t("web.provider.settings.pages.sales/paystack-terminal.failedToLoadTerminalPayments")));

    } finally {

      setLoadingPayments(false);

    }

  }, [reviewDismissedId, selectedTerminalId]);



  useEffect(() => {

    if (bundleLoading || !paystackTerminalEnabled) return;

    void loadTerminals();

    void loadPayments();

    const interval = window.setInterval(() => {

      void loadPayments();

    }, 15_000);

    return () => window.clearInterval(interval);

  }, [bundleLoading, paystackTerminalEnabled, loadTerminals, loadPayments]);



  // Deep link from the "payment received" notification (action_url ?payment=<id>). Locate the

  // payment, scope the inbox to its terminal, and open the review card so the tap lands on it.

  useEffect(() => {

    if (bundleLoading || !paystackTerminalEnabled) return;

    const paymentId = new URLSearchParams(window.location.search).get("payment");

    if (!paymentId) return;

    let cancelled = false;

    void (async () => {

      try {

        const payload = await fetcher.get<PaymentsResponse>(

          "/api/provider/paystack/terminal-payments?limit=50",

          { staleTimeMs: 0 },

        );

        const found = (payload?.data?.items ?? []).find((item) => item.id === paymentId);

        if (found && !cancelled) {

          if (found.terminal?.id) setSelectedTerminalId(found.terminal.id);

          setReviewDismissedId(null);

          setReviewPayment(found);

        }

      } catch {

        /* non-fatal: the inbox list still reflects the payment */

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [bundleLoading, paystackTerminalEnabled]);



  async function requestTerminalSetup() {

    setCreating(true);

    try {

      const payload = await fetcher.post<{

        data?: { message?: string };

        error?: { message?: string; code?: string };

      }>("/api/provider/paystack/virtual-terminals", {});

      if (payload?.error) {

        throw new Error(

          paystackTerminalErrorMessage(payload.error.message, payload.error.code),

        );

      }

      toast.success(payload?.data?.message || t("web.provider.settings.pages.sales/paystack-terminal.opsNotified"));

      await loadTerminals();

    } catch (error) {

      toastPlanGateError(error, apiErrorMessage(error, t("web.provider.settings.pages.sales/paystack-terminal.failedToRequestTerminalSetup")));

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

        throw new Error(payload.error.message || t("web.provider.settings.pages.sales/paystack-terminal.failedToRequestBrandedAssets"));

      }

      toast.success(payload?.data?.message || t("web.provider.settings.pages.sales/paystack-terminal.opsNotified"));

      await loadTerminals();

    } catch (error) {

      toast.error(apiErrorMessage(error, t("web.provider.settings.pages.sales/paystack-terminal.failedToRequestBrandedAssets")));

    } finally {

      setRequestingAssetsId(null);

    }

  }



  function assetLabel(status?: string | null) {

    if (status === "ready") return t("web.provider.settings.pages.sales/paystack-terminal.ready");

    if (status === "link_ready") return t("web.provider.settings.pages.sales/paystack-terminal.linkReady");

    if (status === "poster_ready") return t("web.provider.settings.pages.sales/paystack-terminal.posterReady");

    return t("web.provider.settings.pages.sales/paystack-terminal.setupNeeded");

  }



  function amountMatchLabel(status?: string | null) {

    if (status === "exact_match") return t("web.provider.settings.pages.sales/paystack-terminal.amountMatches");

    if (status === "partial_payment") return t("web.provider.settings.pages.sales/paystack-terminal.partialPayment");

    if (status === "overpayment") return t("web.provider.settings.pages.sales/paystack-terminal.overpayment");

    if (status === "currency_mismatch") return t("web.provider.settings.pages.sales/paystack-terminal.currencyMismatch");

    if (status === "ambiguous_amount_match") return t("web.provider.settings.pages.sales/paystack-terminal.ambiguousAmountMatch");

    if (status === "amount_only_match") return t("web.provider.settings.pages.sales/paystack-terminal.amountOnlyMatch");

    return t("web.provider.settings.pages.sales/paystack-terminal.needsReview");

  }



  async function allocatePayment(payment: PaystackTerminalPayment, action: "confirm" | "decline" | "admin_review") {

    setAllocatingPaymentId(payment.id);

    try {

      let body: Record<string, unknown>;

      if (action === "confirm") {

        if (!payment.suggested_entity_type || !payment.suggested_entity_id) {

          toast.error(t("web.provider.settings.pages.sales/paystack-terminal.noSuggestedTargetWasFoundSend"));

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

        throw new Error(payload.error.message || t("web.provider.settings.pages.sales/paystack-terminal.failedToUpdateAllocation"));

      }

      toast.success(action === "confirm" ? t("web.provider.terminalPaymentAlert.allocated") : t("web.provider.settings.pages.sales/paystack-terminal.paymentSentForReview"));

      setReviewPayment(null);

      await loadPayments();

    } catch (error) {

      toast.error(apiErrorMessage(error, t("web.provider.settings.pages.sales/paystack-terminal.failedToUpdateAllocation")));

    } finally {

      setAllocatingPaymentId(null);

    }

  }



  async function copyTerminalCode(code: string) {

    await navigator.clipboard.writeText(code);

    toast.success(t("web.provider.settings.pages.sales/paystack-terminal.terminalCodeCopied"));

  }



  async function copyPaymentLink(link: string) {

    await navigator.clipboard.writeText(link);

    toast.success(t("web.provider.settings.pages.sales/paystack-terminal.paymentLinkCopied"));

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

    const name = terminal.display_name || terminal.name || t("web.provider.settings.pages.sales/paystack-terminal.payHere");

    const link = terminal.payment_link ?? terminal.terminal_url ?? "";

    const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=1000");

    if (!win) {

      toast.error(t("web.provider.settings.pages.sales/paystack-terminal.couldNotOpenThePosterCheck"));

      return;

    }

    win.document.write(`<!doctype html><html><head><title>${name} — ${t("web.provider.settings.pages.sales/paystack-terminal.payHere")}</title>

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

  <p>${t("web.provider.settings.pages.sales/paystack-terminal.scanToPay")}</p>

  ${qr ? `<div class="qr"><img src="${qr}" alt="${t("web.provider.settings.pages.sales/paystack-terminal.paymentQrAlt")}" /></div>` : `<p>${t("web.provider.settings.pages.sales/paystack-terminal.qrNotAvailable")}</p>`}

  <p class="code">${terminal.terminal_code}</p>

  ${link ? `<p class="link">${link}</p>` : ""}

  <button onclick="window.print()" style="margin-top:24px;padding:12px 24px;font-size:16px;border-radius:8px;border:none;background:#0f172a;color:#fff;cursor:pointer">${t("web.provider.settings.pages.sales/paystack-terminal.printPoster")}</button>

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

        title={t("web.provider.settings.categories.sales.items.paystackTerminal.title")}

        description={t("web.provider.settings.pages.sales/paystack-terminal.inPersonQrDescription")}

        backHref="/provider/settings"

      >

        <SectionCard>

          <p className="text-sm text-muted-foreground">{t("web.provider.settings.pages.sales/paystack-terminal.loading")}</p>

        </SectionCard>

      </SettingsDetailLayout>

    );

  }



  if (!paystackTerminalEnabled) {

    return (

      <SettingsDetailLayout

        title={t("web.provider.settings.pages.sales/paystack-terminal.paystackTerminal")}

        description={t("web.provider.settings.pages.sales/paystack-terminal.inPersonQrDescription")}

        backHref="/provider/settings"

      >

        <SectionCard>

          <p className="text-sm text-muted-foreground">

            {t("web.provider.settings.pages.sales/paystack-terminal.notEnabledForMarket")}

          </p>

        </SectionCard>

      </SettingsDetailLayout>

    );

  }



  return (

    <SettingsDetailLayout

      title={t("web.provider.settings.pages.sales/paystack-terminal.paystackTerminal")}

      description={t("web.provider.settings.pages.sales/paystack-terminal.virtualTerminalsDescription")}

      backHref="/provider/settings"

    >

      <div className="space-y-6">

        <Alert>

          <AlertDescription>

            {t("web.provider.settings.pages.sales/paystack-terminal.whatsappAlertsBody")}

          </AlertDescription>

        </Alert>



        {!canRequestSetup ? (

          <Alert variant="destructive">

            <AlertDescription>

              {t("web.provider.settings.pages.sales/paystack-terminal.planDoesNotInclude")} <a href="/provider/subscription" className="underline font-medium">{t("web.provider.settings.pages.sales/paystack-terminal.viewPlans")}</a>

            </AlertDescription>

          </Alert>

        ) : null}



        {hasPendingRequest && terminals.length === 0 ? (

          <Alert className="border-amber-200 bg-amber-50">

            <Clock className="h-4 w-4 text-amber-800" />

            <AlertDescription className="text-amber-900">

              <span className="font-semibold">{t("web.provider.settings.pages.sales/paystack-terminal.setupRequestReceived")}</span> {t("web.provider.settings.pages.sales/paystack-terminal.setupRequestReceivedBody")}

              {pendingRequests[0]?.request_notes ? (

                <span className="mt-2 block text-sm text-amber-800">{pendingRequests[0].request_notes}</span>

              ) : null}

            </AlertDescription>

          </Alert>

        ) : null}



        {rejectedRequest && !hasPendingRequest ? (

          <Alert variant="destructive">

            <AlertDescription>

              <span className="font-semibold">{t("web.provider.settings.pages.sales/paystack-terminal.lastRequestNeedsChanges")}</span>

              {rejectedRequest.rejection_reason ? (

                <span className="mt-2 block text-sm">{rejectedRequest.rejection_reason}</span>

              ) : null}

              <span className="mt-2 block text-sm">

                {t("web.provider.settings.pages.sales/paystack-terminal.submitNewRequestHint")}

              </span>

              {rejectedRequest.support_ticket_id ? (

                <span className="mt-2 block text-sm">

                  {t("web.provider.settings.pages.sales/paystack-terminal.supportConversationOpened")}

                </span>

              ) : null}

            </AlertDescription>

          </Alert>

        ) : null}

        <SectionCard>

          <h2 className="text-lg font-semibold">{t("web.provider.settings.pages.sales/paystack-terminal.requestTerminalSetupTitle")}</h2>

          <p className="mt-1 text-sm text-muted-foreground">

            {t("web.provider.settings.pages.sales/paystack-terminal.requestTerminalSetupBody")}

          </p>

          <p className="mt-2 text-xs text-muted-foreground">

            {t("web.provider.settings.pages.sales/paystack-terminal.onceImportedHint")}

          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">

            <Button

              onClick={requestTerminalSetup}

              disabled={creating || hasPendingRequest || !canRequestSetup}

            >

              {creating

                ? t("web.provider.settings.pages.sales/paystack-terminal.requesting")

                : hasPendingRequest

                  ? t("web.provider.settings.pages.sales/paystack-terminal.setupRequestPending")

                  : !canRequestSetup

                    ? t("web.provider.settings.pages.sales/paystack-terminal.notAvailableOnPlan")

                    : rejectedRequest

                      ? t("web.provider.settings.pages.sales/paystack-terminal.updateSubmitNewRequest")

                      : t("web.provider.settings.pages.sales/paystack-terminal.requestPaystackTerminalSetup")}

            </Button>

          </div>

        </SectionCard>



        <SectionCard>

          <div className="flex items-center justify-between">

            <div>

              <h2 className="text-lg font-semibold">{t("web.provider.settings.pages.sales/paystack-terminal.terminals")}</h2>

              <p className="text-sm text-muted-foreground">

                {t("web.provider.settings.pages.sales/paystack-terminal.useTheseCodes")}

              </p>

            </div>

            <Button variant="outline" onClick={() => void loadTerminals()} disabled={loading}>

              {t("common.refresh")}

            </Button>

          </div>



          <div className="mt-4 space-y-3">

            {loading ? (

              <p className="text-sm text-muted-foreground">{t("web.provider.settings.pages.sales/paystack-terminal.loadingTerminals")}</p>

            ) : terminals.length === 0 ? (

              <p className="text-sm text-muted-foreground">

                {hasPendingRequest

                  ? t("web.provider.settings.pages.sales/paystack-terminal.terminalAppearsOnceReady")

                  : t("web.provider.settings.pages.sales/paystack-terminal.noPaystackTerminalsYet")}

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

                        {t("web.provider.settings.pages.sales/paystack-terminal.currencyLabel", { currency: terminal.currency })}

                        {terminal.last_payment_at

                          ? t("web.provider.settings.pages.sales/paystack-terminal.lastPayment", { date: new Date(terminal.last_payment_at).toLocaleString() })

                          : ""}

                      </p>

                      {terminal.notification_whatsapp ? (

                        <p className="mt-1 text-xs text-muted-foreground">

                          {t("web.provider.settings.pages.sales/paystack-terminal.notificationsWhatsappEnding", { last4: terminal.notification_whatsapp.replace(/\D/g, "").slice(-4) })}

                        </p>

                      ) : null}

                      {terminal.asset_status !== "ready" ? (

                        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">

                          {t("web.provider.settings.pages.sales/paystack-terminal.opsNeedsAssets")}

                        </p>

                      ) : null}

                      {(terminalQrSrc(terminal) || terminal.poster_url) ? (

                        <div className="mt-3 flex flex-wrap items-start gap-4">

                          {terminalQrSrc(terminal) ? (

                            <div className="flex flex-col items-center gap-1">

                              {/* eslint-disable-next-line @next/next/no-img-element */}

                              <img

                                src={terminalQrSrc(terminal) ?? undefined}

                                alt={t("web.provider.settings.pages.sales/paystack-terminal.paystackTerminalQrAlt")}

                                className="h-40 w-40 rounded-md border bg-white object-contain p-1"

                              />

                              <span className="text-[11px] text-muted-foreground">{t("web.provider.settings.pages.sales/paystack-terminal.customerScansToPay")}</span>

                            </div>

                          ) : null}

                          {terminal.poster_url ? (

                            <a href={terminal.poster_url} target="_blank" rel="noreferrer" className="block">

                              {/* eslint-disable-next-line @next/next/no-img-element */}

                              <img

                                src={terminal.poster_url}

                                alt={t("web.provider.settings.pages.sales/paystack-terminal.paystackTerminalPosterAlt")}

                                className="h-40 w-auto rounded-md border object-contain"

                              />

                              <span className="mt-1 block text-center text-[11px] text-muted-foreground">

                                {t("web.provider.settings.pages.sales/paystack-terminal.tapToViewPoster")}

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

                        {t("web.provider.settings.pages.sales/paystack-terminal.copyCode")}

                      </Button>

                      {terminal.payment_link || terminal.terminal_url ? (

                        <>

                          <Button

                            variant="outline"

                            onClick={() => void copyPaymentLink(terminal.payment_link ?? terminal.terminal_url ?? "")}

                          >

                            {t("web.provider.settings.pages.sales/paystack-terminal.copyLink")}

                          </Button>

                          <Button

                            variant="outline"

                            onClick={() => {

                              const posterHref = terminal.poster_url ?? terminal.qr_url ?? null;

                              if (posterHref) {

                                window.open(posterHref, "_blank", "noreferrer");

                              } else {

                                printTerminalPoster(terminal);

                              }

                            }}

                          >

                            {t("web.provider.settings.pages.sales/paystack-terminal.openQrPoster")}

                          </Button>

                        </>

                      ) : null}

                      {terminal.qr_url ? (

                        <Button asChild variant="outline">

                          <a href={terminal.qr_url} target="_blank" rel="noreferrer">

                            {t("web.provider.settings.pages.sales/paystack-terminal.showQr")}

                          </a>

                        </Button>

                      ) : null}

                      {terminal.poster_url ? (

                        <Button asChild variant="outline">

                          <a href={terminal.poster_url} download target="_blank" rel="noreferrer">

                            {t("web.provider.settings.pages.sales/paystack-terminal.downloadPoster")}

                          </a>

                        </Button>

                      ) : null}

                      {(terminal.payment_link || terminal.terminal_url || terminal.qr_url) ? (

                        <Button variant="outline" onClick={() => printTerminalPoster(terminal)}>

                          {t("web.provider.settings.pages.sales/paystack-terminal.printPoster")}

                        </Button>

                      ) : null}

                      {terminal.asset_status !== "ready" ? (

                        <Button

                          variant="outline"

                          onClick={() => void requestBrandedAssets(terminal.id)}

                          disabled={requestingAssetsId === terminal.id}

                        >

                          {requestingAssetsId === terminal.id ? t("web.provider.settings.pages.sales/paystack-terminal.requesting") : t("web.provider.settings.pages.sales/paystack-terminal.requestBrandedQrPoster")}

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

              <h2 className="text-lg font-semibold">{t("web.provider.settings.pages.sales/paystack-terminal.paymentInbox")}</h2>

              <p className="text-sm text-muted-foreground">

                {t("web.provider.settings.pages.sales/paystack-terminal.paymentInboxHint")}

              </p>

            </div>

            <div className="flex items-center gap-2">

              {terminals.length > 1 ? (

                <select

                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"

                  value={selectedTerminalId ?? ""}

                  onChange={(event) => setSelectedTerminalId(event.target.value || null)}

                  aria-label={t("web.provider.settings.pages.sales/paystack-terminal.filterInboxByTerminal")}

                >

                  {terminals.map((terminal) => (

                    <option key={terminal.id} value={terminal.id}>

                      {terminal.display_name || terminal.name || terminal.terminal_code}

                    </option>

                  ))}

                </select>

              ) : null}

              <Button variant="outline" onClick={() => void loadPayments()} disabled={loadingPayments}>

                {t("common.refresh")}

              </Button>

            </div>

          </div>



          {reviewPayment ? (

            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                <div>

                  <h3 className="text-base font-semibold text-emerald-950">{t("web.provider.settings.pages.sales/paystack-terminal.paymentReceived")}</h3>

                  <p className="mt-1 text-sm text-emerald-800">

                    {t("web.provider.settings.pages.sales/paystack-terminal.checkAmountBeforeAllocate")}

                  </p>

                  <p className="mt-3 text-2xl font-bold text-gray-900">

                    {reviewPayment.currency} {Number(reviewPayment.paid_amount ?? 0).toFixed(2)}

                  </p>

                  <p className="text-xs text-gray-600">

                    {t("web.provider.settings.pages.sales/paystack-terminal.expected")}{" "}

                    {reviewPayment.expected_amount != null

                      ? `${reviewPayment.currency} ${Number(reviewPayment.expected_amount).toFixed(2)}`

                      : t("web.provider.settings.pages.sales/paystack-terminal.noExpectedAmount")}

                  </p>

                  <p className="mt-2 text-xs font-semibold text-emerald-800">

                    {amountMatchLabel(reviewPayment.amount_match_status)} · {reviewPayment.amount_match_status}

                  </p>

                  <p className="mt-2 font-mono text-xs text-gray-600">{t("web.provider.settings.pages.sales/paystack-terminal.paystackRef", { ref: reviewPayment.paystack_reference })}</p>

                  <p className="text-xs text-gray-600">{t("web.provider.settings.pages.sales/paystack-terminal.bookingOrderNote", { note: reviewPayment.customer_reference || t("web.provider.settings.pages.sales/paystack-terminal.notSupplied") })}</p>

                  <p className="text-xs text-gray-600">

                    {t("web.provider.settings.pages.sales/paystack-terminal.suggestedTarget")}{" "}

                    {reviewPayment.suggested_entity_type && reviewPayment.suggested_entity_id

                      ? t("web.provider.settings.pages.sales/paystack-terminal.suggestedTargetValue", { type: reviewPayment.suggested_entity_type, id: reviewPayment.suggested_entity_id.slice(0, 8) })

                      : t("web.provider.settings.pages.sales/paystack-terminal.noConfidentMatch")}

                  </p>

                </div>

                <div className="flex flex-wrap gap-2">

                  {reviewPayment.suggested_entity_id ? (

                    <Button

                      onClick={() => void allocatePayment(reviewPayment, "confirm")}

                      disabled={allocatingPaymentId === reviewPayment.id}

                    >

                      {t("web.provider.settings.pages.sales/paystack-terminal.approveMatch")}

                    </Button>

                  ) : null}

                  <Button

                    variant="outline"

                    onClick={() => void allocatePayment(reviewPayment, "admin_review")}

                    disabled={allocatingPaymentId === reviewPayment.id}

                  >

                    {reviewPayment.suggested_entity_id ? t("web.provider.settings.pages.sales/paystack-terminal.adminReview") : t("web.provider.settings.pages.sales/paystack-terminal.sendToAdminToAllocate")}

                  </Button>

                  <Button

                    variant="outline"

                    onClick={() => void allocatePayment(reviewPayment, "decline")}

                    disabled={allocatingPaymentId === reviewPayment.id}

                  >

                    {t("web.provider.settings.pages.sales/paystack-terminal.incorrectRef")}

                  </Button>

                  <Button variant="ghost" onClick={() => dismissReview(reviewPayment.id)}>

                    {t("web.provider.common.dismiss")}

                  </Button>

                </div>

              </div>

            </div>

          ) : null}



          <div className="mt-4 space-y-3">

            {loadingPayments ? (

              <p className="text-sm text-muted-foreground">{t("web.provider.settings.pages.sales/paystack-terminal.loadingTerminalPayments")}</p>

            ) : payments.length === 0 ? (

              <p className="text-sm text-muted-foreground">{t("web.provider.settings.pages.sales/paystack-terminal.noTerminalPaymentsYet")}</p>

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

                        {t("web.provider.settings.pages.sales/paystack-terminal.bookingOrderNote", { note: payment.customer_reference || t("web.provider.settings.pages.sales/paystack-terminal.notSupplied") })}

                      </p>

                    </div>

                    {["suggested", "unmatched", "admin_review"].includes(payment.allocation_status) ? (

                      <Button variant="outline" onClick={() => setReviewPayment(payment)}>

                        {t("web.provider.settings.pages.sales/paystack-terminal.reviewPayment")}

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


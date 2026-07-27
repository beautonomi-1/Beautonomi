import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { cn } from "@/lib/cn";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

export type PaycloudInitiationChannel = "cloud" | "same_terminal";

type PaycloudPaymentDetail = {
  payment: {
    id: string;
    merchant_order_no: string;
    paycloud_order_id?: string | null;
    status: string;
    amount: number;
    expected_amount: number;
    tip_amount?: number | null;
    cashback_amount?: number | null;
    currency: string;
    amount_match_status: string;
    environment: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
    updated_at?: string | null;
    provider?: { id?: string; business_name?: string | null } | null;
    terminal?: {
      display_name?: string | null;
      terminal_sn?: string | null;
      status?: string | null;
      model?: string | null;
      last_error?: string | null;
    } | null;
  };
  diagnostics: {
    initiation_channel: PaycloudInitiationChannel;
    response_code: string | null;
    error_message: string | null;
    trans_status: string | null;
    pay_scenario: string | null;
    pay_method_id: string | null;
    device: {
      serial: string | null;
      model: string | null;
      manufacturer: string | null;
      serial_source: string | null;
      paired_device_id: string | null;
    };
    intent: {
      result: string;
      result_message: string | null;
      explanation: string;
      transaction_id: string | null;
      ref_no: string | null;
      auth_code: string | null;
      card_no: string | null;
      trans_date: string | null;
      trans_time: string | null;
      confirmed_at: string | null;
    } | null;
  };
  webhook_events: Array<{
    id: string;
    event_type: string | null;
    signature_valid: boolean | null;
    processed: boolean;
    processing_error: string | null;
    payload: Record<string, unknown> | null;
    created_at: string;
  }>;
  raw: {
    request: unknown;
    response: unknown;
  };
};

export function channelLabel(channel: string | null | undefined): string {
  return channel === "same_terminal" ? "On device" : "Cloud";
}

function money(amount: number | string | null | undefined, currency = "ZAR") {
  return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children ?? "—"}</dd>
    </div>
  );
}

function Mono({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-gray-400">—</span>;
  return <span className="font-mono text-xs">{value}</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RawJson({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-gray-700">{label}</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-gray-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/**
 * Support drill-down for a single card-machine payment: the decline code, which
 * physical device took the charge, whether it ran on-device or via Cloud Mode,
 * and the webhook history. Superadmin-only, matching the operations console.
 */
export function PaycloudPaymentDetailModal({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const detailQ = useQuery({
    queryKey: adminQueryKeys.paycloudOperations.payment(paymentId),
    queryFn: () =>
      adminApi.getJson<PaycloudPaymentDetail>(
        `/api/admin/paycloud-operations/payments/${encodeURIComponent(paymentId)}`,
        { timeoutMs: 30_000 },
      ),
  });

  const detail = detailQ.data;
  const payment = detail?.payment;
  const diagnostics = detail?.diagnostics;
  const intent = diagnostics?.intent;
  const device = diagnostics?.device;

  return (
    <AdminModal
      open
      onClose={onClose}
      size="2xl"
      title="Card machine payment"
      description={
        payment
          ? `${payment.entity_type} · ${payment.merchant_order_no}`
          : "Loading payment diagnostics…"
      }
      footer={
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      {detailQ.isLoading ? (
        <AdminPageSkeleton rows={6} />
      ) : detailQ.error ? (
        <AdminRetryBlock
          message={detailQ.error.message}
          onRetry={() => void detailQ.refetch()}
        />
      ) : !detail || !payment || !diagnostics ? (
        <p className="text-sm text-gray-600">Payment not found.</p>
      ) : (
        <div className="space-y-4">
          {/* Why it failed — the question support actually needs answered. */}
          {diagnostics.error_message || diagnostics.response_code ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h4 className="text-sm font-semibold text-red-900">Failure detail</h4>
              <p className="mt-1 text-sm text-red-900">
                {diagnostics.error_message ?? "No message returned by the gateway."}
              </p>
              {diagnostics.response_code ? (
                <p className="mt-1 text-xs text-red-800">
                  Gateway response code <span className="font-mono">{diagnostics.response_code}</span>
                </p>
              ) : null}
              {intent ? (
                <p className="mt-1 text-xs text-red-800">
                  Card app result <span className="font-mono">{intent.result}</span> — {intent.explanation}
                </p>
              ) : null}
            </div>
          ) : null}

          <Section title="Payment">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Field label="Status">{payment.status.replace(/_/g, " ")}</Field>
              <Field label="Amount match">{payment.amount_match_status.replace(/_/g, " ")}</Field>
              <Field label="Started via">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                    diagnostics.initiation_channel === "same_terminal"
                      ? "bg-indigo-100 text-indigo-900"
                      : "bg-gray-100 text-gray-800",
                  )}
                >
                  {channelLabel(diagnostics.initiation_channel)}
                </span>
              </Field>
              <Field label="Captured">{money(payment.amount, payment.currency)}</Field>
              <Field label="Expected">{money(payment.expected_amount, payment.currency)}</Field>
              <Field label="Environment">{payment.environment}</Field>
              <Field label="Tip">{money(payment.tip_amount ?? 0, payment.currency)}</Field>
              <Field label="Cashback">{money(payment.cashback_amount ?? 0, payment.currency)}</Field>
              <Field label="Gateway trans status">
                <Mono value={diagnostics.trans_status} />
              </Field>
              <Field label="Merchant order no">
                <Mono value={payment.merchant_order_no} />
              </Field>
              <Field label="PayCloud order id">
                <Mono value={payment.paycloud_order_id} />
              </Field>
              <Field label="Pay scenario">
                <Mono value={diagnostics.pay_scenario} />
              </Field>
              <Field label="Created">{new Date(payment.created_at).toLocaleString()}</Field>
              <Field label="Last updated">
                {payment.updated_at ? new Date(payment.updated_at).toLocaleString() : "—"}
              </Field>
              <Field label="Entity">
                <span className="text-xs">{payment.entity_type}</span>
                <br />
                <Mono value={payment.entity_id} />
              </Field>
            </dl>
          </Section>

          <Section title="Machine and device">
            <dl className="grid gap-3 sm:grid-cols-3">
              <Field label="Machine">{payment.terminal?.display_name ?? "—"}</Field>
              <Field label="Machine serial">
                <Mono value={payment.terminal?.terminal_sn} />
              </Field>
              <Field label="Machine status">{payment.terminal?.status ?? "—"}</Field>
              <Field label="Device model">
                {device?.model ?? payment.terminal?.model ?? "—"}
              </Field>
              <Field label="Device make">{device?.manufacturer ?? "—"}</Field>
              <Field label="Device id">
                <Mono value={device?.serial} />
              </Field>
              <Field label="Device id source">{device?.serial_source ?? "—"}</Field>
              <Field label="Manually paired id">
                <Mono value={device?.paired_device_id} />
              </Field>
              <Field label="Last machine error">
                {payment.terminal?.last_error ? (
                  <span className="text-red-800">{payment.terminal.last_error}</span>
                ) : (
                  "—"
                )}
              </Field>
            </dl>
          </Section>

          {intent ? (
            <Section title="On-device card app result">
              <dl className="grid gap-3 sm:grid-cols-3">
                <Field label="Result code">
                  <Mono value={intent.result} />
                </Field>
                <Field label="Meaning">{intent.explanation}</Field>
                <Field label="Raw message">{intent.result_message ?? "—"}</Field>
                <Field label="Transaction id">
                  <Mono value={intent.transaction_id} />
                </Field>
                <Field label="Reference no">
                  <Mono value={intent.ref_no} />
                </Field>
                <Field label="Auth code">
                  <Mono value={intent.auth_code} />
                </Field>
                <Field label="Card">
                  <Mono value={intent.card_no} />
                </Field>
                <Field label="On-device timestamp">
                  {intent.trans_date || intent.trans_time
                    ? `${intent.trans_date ?? ""} ${intent.trans_time ?? ""}`.trim()
                    : "—"}
                </Field>
                <Field label="Confirmed to server">
                  {intent.confirmed_at ? new Date(intent.confirmed_at).toLocaleString() : "—"}
                </Field>
              </dl>
            </Section>
          ) : null}

          <Section title={`Webhook timeline (${detail.webhook_events.length})`}>
            {detail.webhook_events.length === 0 ? (
              <p className="text-sm text-gray-600">
                No webhook callbacks recorded. For an unresolved payment this usually means PayCloud
                never reached the notify URL — status here came from polling or reconcile instead.
              </p>
            ) : (
              <ol className="space-y-2">
                {detail.webhook_events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {event.event_type ?? "callback"}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          event.processed
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900",
                        )}
                      >
                        {event.processed ? "processed" : "not processed"}
                      </span>
                      {event.signature_valid === false ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">
                          bad signature
                        </span>
                      ) : null}
                    </div>
                    {event.processing_error ? (
                      <p className="mt-1 text-xs text-red-800">{event.processing_error}</p>
                    ) : null}
                    <div className="mt-2">
                      <RawJson label="Payload" value={event.payload} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Raw gateway exchange">
            <div className="space-y-2">
              <RawJson label="Request sent to PayCloud" value={detail.raw.request} />
              <RawJson label="Response from PayCloud" value={detail.raw.response} />
              {detail.raw.request == null && detail.raw.response == null ? (
                <p className="text-sm text-gray-600">
                  Nothing recorded — an on-device payment never calls the Cloud Mode order API.
                </p>
              ) : null}
            </div>
          </Section>
        </div>
      )}
    </AdminModal>
  );
}

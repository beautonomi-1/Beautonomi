"use client";

import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import type { TeamMember, Salon } from "@/lib/provider-portal/types";
import type { AppointmentService } from "@/components/appointments/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import type { AppointmentKindValue } from "./AppointmentKindSelector";
import type { CreatePaymentMethod } from "./CreatePaymentSection";
import { MembershipPreviewPill } from "./MembershipPreviewPill";
import {
  BookingSectionCard,
  BookingSectionLabel,
  BookingSummaryRow,
} from "../ui";

interface AppointmentReviewStepProps {
  clientName: string;
  clientId?: string;
  staffId: string;
  teamMembers: TeamMember[];
  date: string;
  startTime: string;
  services: AppointmentService[];
  notes?: string;
  totalAmount: number;
  locationId?: string;
  locations?: Salon[];
  appointmentKind?: AppointmentKindValue;
  paymentMethod?: CreatePaymentMethod;
  sendNotification?: boolean;
  onSendNotificationChange?: (value: boolean) => void;
  collectDeposit?: boolean;
  depositPercentage?: number;
  discountAmount?: number;
  discountLabel?: string;
  tipAmount?: number;
  isRecurring?: boolean;
  subtotal?: number;
  travelFee?: number;
  taxAmount?: number;
  taxRate?: number;
  taxInclusive?: boolean;
  durationMinutes?: number;
  products?: Array<{ productName: string; totalPrice: number }>;
}

const KIND_LABELS: Record<AppointmentKindValue, string> = {
  in_salon: "In salon",
  walk_in: "Walk-in",
  at_home: "At home",
};

const PAYMENT_LABELS: Record<CreatePaymentMethod, string> = {
  pay_later: "Pay later",
  cash: "Cash / in person",
  card: "Card — already taken",
  payment_link: "Payment link",
  yoco_pos: "Yoco terminal",
  paycloud_terminal: "Card machine (PayCloud)",
  paystack_terminal: "Paystack terminal",
};

function formatTaxLabel(taxRate: number, taxInclusive: boolean): string {
  const pct = (Math.round(taxRate * 10000) / 100).toFixed(1);
  return taxInclusive ? `VAT (${pct}% incl.)` : `Tax (${pct}%)`;
}

export function AppointmentReviewStep({
  clientName,
  clientId,
  staffId,
  teamMembers,
  date,
  startTime,
  services,
  notes,
  totalAmount,
  locationId,
  locations = [],
  appointmentKind = "in_salon",
  paymentMethod = "pay_later",
  sendNotification = true,
  onSendNotificationChange,
  collectDeposit = false,
  depositPercentage = 50,
  discountAmount = 0,
  discountLabel = "Discount",
  tipAmount = 0,
  isRecurring = false,
  subtotal = 0,
  travelFee = 0,
  taxAmount = 0,
  taxRate = 0,
  taxInclusive = true,
  durationMinutes = 0,
  products = [],
}: AppointmentReviewStepProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const staffName = teamMembers.find((m) => m.id === staffId)?.name ?? "Unassigned";
  const locationName = locations.find((l) => l.id === locationId)?.name;
  const depositAmount = collectDeposit ? (totalAmount * depositPercentage) / 100 : 0;
  const totalDuration =
    durationMinutes ||
    services.reduce((sum, s) => {
      const addonMin = s.addons?.reduce((a, ad) => a + ad.duration, 0) ?? 0;
      return sum + s.duration + addonMin;
    }, 0);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">Review and confirm booking details</p>
      </div>

      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">Summary</BookingSectionLabel>
        <BookingSummaryRow label="Client" value={clientName || "—"} />
        <BookingSummaryRow label="Staff" value={staffName} />
        <BookingSummaryRow label="Type" value={KIND_LABELS[appointmentKind]} />
        {locationName ? <BookingSummaryRow label="Location" value={locationName} /> : null}
        {date && startTime ? (
          <BookingSummaryRow
            label="When"
            value={`${format(new Date(`${date}T${startTime}`), "EEE d MMM")} · ${startTime}`}
          />
        ) : null}
        {totalDuration > 0 ? (
          <BookingSummaryRow label="Duration" value={`${totalDuration} min`} />
        ) : null}
        <BookingSummaryRow label="Payment" value={PAYMENT_LABELS[paymentMethod]} />
        {collectDeposit ? (
          <BookingSummaryRow
            label="Deposit"
            value={`${depositPercentage}% (${formatMoney(depositAmount)} due now)`}
          />
        ) : null}
        {isRecurring ? <BookingSummaryRow label="Repeating" value="Yes" /> : null}
      </BookingSectionCard>

      <BookingSectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Notify client</p>
            <p className="text-xs text-gray-500">
              {sendNotification ? "Send booking confirmation" : "Silent booking — no notification"}
            </p>
          </div>
          {onSendNotificationChange ? (
            <Switch checked={sendNotification} onCheckedChange={onSendNotificationChange} />
          ) : (
            <span className="text-sm text-gray-700">
              {sendNotification ? "Yes" : "No — silent booking"}
            </span>
          )}
        </div>
      </BookingSectionCard>

      {clientId ? (
        <MembershipPreviewPill customerId={clientId} subtotal={subtotal} />
      ) : null}

      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">Pricing</BookingSectionLabel>
        {subtotal > 0 ? <BookingSummaryRow label="Subtotal" value={formatMoney(subtotal)} /> : null}
        {travelFee > 0 ? <BookingSummaryRow label="Travel fee" value={formatMoney(travelFee)} /> : null}
        {discountAmount > 0 ? (
          <BookingSummaryRow label={discountLabel} value={`−${formatMoney(discountAmount)}`} />
        ) : null}
        {taxAmount > 0 ? (
          <BookingSummaryRow
            label={taxRate > 0 ? formatTaxLabel(taxRate, taxInclusive) : "Tax"}
            value={formatMoney(taxAmount)}
          />
        ) : null}
        {tipAmount > 0 ? <BookingSummaryRow label="Tip" value={formatMoney(tipAmount)} /> : null}
        <BookingSummaryRow label="Total" value={formatMoney(totalAmount)} emphasize />
        {collectDeposit ? (
          <BookingSummaryRow
            label="Due now (deposit)"
            value={formatMoney(depositAmount)}
            emphasize
          />
        ) : null}
      </BookingSectionCard>

      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">Services</BookingSectionLabel>
        {services.length === 0 ? (
          <p className="text-sm text-gray-500">No services selected</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {services.map((svc) => (
              <li key={svc.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-gray-900">{svc.serviceName}</span>
                <span className="shrink-0 text-gray-600 tabular-nums">
                  {formatMoney(svc.price)} · {svc.duration} min
                </span>
              </li>
            ))}
          </ul>
        )}
      </BookingSectionCard>

      {products.length > 0 ? (
        <BookingSectionCard>
          <BookingSectionLabel className="mb-3">Products</BookingSectionLabel>
          <ul className="divide-y divide-gray-100">
            {products.map((p) => (
              <li key={p.productName} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-gray-900">{p.productName}</span>
                <span className="tabular-nums text-gray-600">{formatMoney(p.totalPrice)}</span>
              </li>
            ))}
          </ul>
        </BookingSectionCard>
      ) : null}

      {notes ? (
        <BookingSectionCard>
          <BookingSectionLabel className="mb-2">Notes</BookingSectionLabel>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
        </BookingSectionCard>
      ) : null}
    </div>
  );
}

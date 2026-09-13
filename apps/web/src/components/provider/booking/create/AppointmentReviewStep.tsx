"use client";

import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "@beautonomi/i18n";
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
  discountLabel,
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
  const { t } = useTranslation();
  const prefix = "web.provider.portal.appointmentReview";
  const { format: formatMoney } = useProviderMoneyFormat();
  const staffName = teamMembers.find((m) => m.id === staffId)?.name ?? t(`${prefix}.unassigned`);
  const locationName = locations.find((l) => l.id === locationId)?.name;
  const depositAmount = collectDeposit ? (totalAmount * depositPercentage) / 100 : 0;
  const totalDuration =
    durationMinutes ||
    services.reduce((sum, s) => {
      const addonMin = s.addons?.reduce((a, ad) => a + ad.duration, 0) ?? 0;
      return sum + s.duration + addonMin;
    }, 0);

  const kindLabels: Record<AppointmentKindValue, string> = {
    in_salon: t(`${prefix}.kindInSalon`),
    walk_in: t(`${prefix}.kindWalkIn`),
    at_home: t(`${prefix}.kindAtHome`),
  };

  const paymentLabels: Record<CreatePaymentMethod, string> = {
    pay_later: t(`${prefix}.payLater`),
    cash: t(`${prefix}.payCash`),
    card: t(`${prefix}.payCard`),
    payment_link: t(`${prefix}.payPaymentLink`),
    yoco_pos: t(`${prefix}.payYocoPos`),
    paycloud_terminal: t(`${prefix}.payPaycloud`),
    paystack_terminal: t(`${prefix}.payPaystack`),
  };

  const formatTaxLabel = (rate: number, inclusive: boolean): string => {
    const pct = (Math.round(rate * 10000) / 100).toFixed(1);
    return inclusive ? t(`${prefix}.taxInclusive`, { pct }) : t(`${prefix}.taxExclusive`, { pct });
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">{t(`${prefix}.reviewBanner`)}</p>
      </div>

      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">{t(`${prefix}.summary`)}</BookingSectionLabel>
        <BookingSummaryRow label={t(`${prefix}.client`)} value={clientName || "—"} />
        <BookingSummaryRow label={t(`${prefix}.staff`)} value={staffName} />
        <BookingSummaryRow label={t(`${prefix}.type`)} value={kindLabels[appointmentKind]} />
        {locationName ? <BookingSummaryRow label={t(`${prefix}.location`)} value={locationName} /> : null}
        {date && startTime ? (
          <BookingSummaryRow
            label={t(`${prefix}.when`)}
            value={t(`${prefix}.whenValue`, {
              date: format(new Date(`${date}T${startTime}`), "EEE d MMM"),
              time: startTime,
            })}
          />
        ) : null}
        {totalDuration > 0 ? (
          <BookingSummaryRow label={t(`${prefix}.duration`)} value={t(`${prefix}.durationMin`, { count: totalDuration })} />
        ) : null}
        <BookingSummaryRow label={t(`${prefix}.payment`)} value={paymentLabels[paymentMethod]} />
        {collectDeposit ? (
          <BookingSummaryRow
            label={t(`${prefix}.deposit`)}
            value={t(`${prefix}.depositValue`, { pct: depositPercentage, amount: formatMoney(depositAmount) })}
          />
        ) : null}
        {isRecurring ? <BookingSummaryRow label={t(`${prefix}.repeating`)} value={t("common.yes")} /> : null}
      </BookingSectionCard>

      <BookingSectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{t(`${prefix}.notifyClient`)}</p>
            <p className="text-xs text-gray-500">
              {sendNotification ? t(`${prefix}.sendConfirmation`) : t(`${prefix}.silentBooking`)}
            </p>
          </div>
          {onSendNotificationChange ? (
            <Switch checked={sendNotification} onCheckedChange={onSendNotificationChange} />
          ) : (
            <span className="text-sm text-gray-700">
              {sendNotification ? t("common.yes") : t(`${prefix}.silentNo`)}
            </span>
          )}
        </div>
      </BookingSectionCard>

      {clientId ? (
        <MembershipPreviewPill customerId={clientId} subtotal={subtotal} />
      ) : null}

      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">{t(`${prefix}.pricing`)}</BookingSectionLabel>
        {subtotal > 0 ? <BookingSummaryRow label={t(`${prefix}.subtotal`)} value={formatMoney(subtotal)} /> : null}
        {travelFee > 0 ? <BookingSummaryRow label={t(`${prefix}.travelFee`)} value={formatMoney(travelFee)} /> : null}
        {discountAmount > 0 ? (
          <BookingSummaryRow label={discountLabel || t(`${prefix}.discount`)} value={`−${formatMoney(discountAmount)}`} />
        ) : null}
        {taxAmount > 0 ? (
          <BookingSummaryRow
            label={taxRate > 0 ? formatTaxLabel(taxRate, taxInclusive) : t(`${prefix}.tax`)}
            value={formatMoney(taxAmount)}
          />
        ) : null}
        {tipAmount > 0 ? <BookingSummaryRow label={t(`${prefix}.tip`)} value={formatMoney(tipAmount)} /> : null}
        <BookingSummaryRow label={t(`${prefix}.total`)} value={formatMoney(totalAmount)} emphasize />
        {collectDeposit ? (
          <BookingSummaryRow
            label={t(`${prefix}.dueNowDeposit`)}
            value={formatMoney(depositAmount)}
            emphasize
          />
        ) : null}
      </BookingSectionCard>

      <BookingSectionCard>
        <BookingSectionLabel className="mb-3">{t(`${prefix}.services`)}</BookingSectionLabel>
        {services.length === 0 ? (
          <p className="text-sm text-gray-500">{t(`${prefix}.noServices`)}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {services.map((svc) => (
              <li key={svc.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-gray-900">{svc.serviceName}</span>
                <span className="shrink-0 text-gray-600 tabular-nums">
                  {t(`${prefix}.serviceMeta`, { price: formatMoney(svc.price), count: svc.duration })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </BookingSectionCard>

      {products.length > 0 ? (
        <BookingSectionCard>
          <BookingSectionLabel className="mb-3">{t(`${prefix}.products`)}</BookingSectionLabel>
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
          <BookingSectionLabel className="mb-2">{t(`${prefix}.notes`)}</BookingSectionLabel>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
        </BookingSectionCard>
      ) : null}
    </div>
  );
}

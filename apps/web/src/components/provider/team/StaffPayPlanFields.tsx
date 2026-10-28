"use client";

import { useTranslation } from "@beautonomi/i18n";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PayModelValue, PayPlanFormState } from "@/lib/payroll/pay-plan-form-state";

export type { PayModelValue, PayPlanFormState };

type Props = {
  value: PayPlanFormState;
  onChange: (next: PayPlanFormState) => void;
  disabled?: boolean;
};

const PAY_MODELS: PayModelValue[] = [
  "commission_only",
  "base_plus_commission",
  "base_or_commission_higher",
  "commission_above_threshold",
  "hourly",
  "hourly_plus_commission",
  "salary",
  "booth_renter",
];

export function StaffPayPlanFields({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const tp = (key: string) =>
    t(`web.provider.settings.pages.team/commissions.${key}`) as string;

  const set = (patch: Partial<PayPlanFormState>) =>
    onChange({ ...value, ...patch });

  const usesCommission = [
    "commission_only",
    "base_plus_commission",
    "base_or_commission_higher",
    "commission_above_threshold",
    "hourly_plus_commission",
  ].includes(value.pay_model);
  const usesBase = ["salary", "base_plus_commission", "base_or_commission_higher"].includes(
    value.pay_model,
  );
  const usesHourly = value.pay_model === "hourly" || value.pay_model === "hourly_plus_commission";
  const usesThreshold = value.pay_model === "commission_above_threshold";

  return (
    <div className="space-y-4">
      <div>
        <Label>{tp("payModel")}</Label>
        <Select
          value={value.pay_model}
          onValueChange={(v) => set({ pay_model: v as PayModelValue })}
          disabled={disabled}
        >
          <SelectTrigger className="mt-1.5 min-h-[44px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAY_MODELS.map((m) => (
              <SelectItem key={m} value={m}>
                {tp(`payModel_${m}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{tp("employmentType")}</Label>
          <Select
            value={value.employment_type}
            onValueChange={(v) =>
              set({ employment_type: v as PayPlanFormState["employment_type"] })
            }
            disabled={disabled}
          >
            <SelectTrigger className="mt-1.5 min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">{tp("employmentEmployee")}</SelectItem>
              <SelectItem value="contractor">{tp("employmentContractor")}</SelectItem>
              <SelectItem value="apprentice">{tp("employmentApprentice")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{tp("effectiveFrom")}</Label>
          <Input
            type="date"
            className="mt-1.5 min-h-[44px]"
            value={value.effective_from}
            onChange={(e) => set({ effective_from: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <Label>{tp("statutoryMode")}</Label>
        <Select
          value={value.statutory_mode}
          onValueChange={(v) =>
            set({ statutory_mode: v as PayPlanFormState["statutory_mode"] })
          }
          disabled={disabled}
        >
          <SelectTrigger className="mt-1.5 min-h-[44px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{tp("statutoryAuto")}</SelectItem>
            <SelectItem value="manual">{tp("statutoryManual")}</SelectItem>
            <SelectItem value="none">{tp("statutoryNone")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500 mt-1">{tp("statutoryModeHint")}</p>
      </div>

      {usesBase && (
        <div>
          <Label>{tp("monthlySalary")}</Label>
          <Input
            type="number"
            min={0}
            className="mt-1.5 min-h-[44px]"
            value={value.base_amount || ""}
            onChange={(e) => set({ base_amount: Number(e.target.value) || 0 })}
            disabled={disabled}
          />
        </div>
      )}

      {usesHourly && (
        <div>
          <Label>{tp("hourlyRate")}</Label>
          <Input
            type="number"
            min={0}
            className="mt-1.5 min-h-[44px]"
            value={value.hourly_rate || ""}
            onChange={(e) => set({ hourly_rate: Number(e.target.value) || 0 })}
            disabled={disabled}
          />
        </div>
      )}

      {usesCommission && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>{tp("serviceCommissionRate")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                className="mt-1.5 min-h-[44px]"
                value={value.service_rate || ""}
                onChange={(e) => set({ service_rate: Number(e.target.value) || 0 })}
                disabled={disabled}
              />
            </div>
            <div>
              <Label>{tp("productCommissionRate")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                className="mt-1.5 min-h-[44px]"
                value={value.product_rate || ""}
                onChange={(e) => set({ product_rate: Number(e.target.value) || 0 })}
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <Label>{tp("tierMode")}</Label>
            <Select
              value={value.tier_mode}
              onValueChange={(v) => set({ tier_mode: v as "retroactive" | "marginal" })}
              disabled={disabled}
            >
              <SelectTrigger className="mt-1.5 min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retroactive">{tp("tierModeRetroactive")}</SelectItem>
                <SelectItem value="marginal">{tp("tierModeMarginal")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {value.tier_mode === "marginal" ? tp("tierModeMarginalHint") : tp("tierModeRetroactiveHint")}
            </p>
          </div>
        </>
      )}

      {usesThreshold && (
        <div>
          <Label>{tp("commissionThreshold")}</Label>
          <Input
            type="number"
            min={0}
            className="mt-1.5 min-h-[44px]"
            value={value.threshold_amount || ""}
            onChange={(e) => set({ threshold_amount: Number(e.target.value) || 0 })}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

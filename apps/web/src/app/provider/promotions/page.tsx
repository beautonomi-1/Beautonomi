"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { ChevronRight, Plus, Tag, Trash2 } from "lucide-react";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import type { ProviderPromotionDto, ProviderPromotionStatus } from "@/lib/promotions/provider-promotion";

type LocationRow = { id: string; name: string; location_type?: string };

type RedemptionRow = {
  client_name: string;
  booking_number: string | null;
  order_number: string | null;
  discount_amount: number;
  used_at: string;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultEndYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return localYmd(d);
}

function statusKey(status: ProviderPromotionStatus): string {
  switch (status) {
    case "active":
      return "statusActive";
    case "scheduled":
      return "statusScheduled";
    case "expired":
      return "statusExpired";
    case "used_up":
      return "statusUsedUp";
    default:
      return "statusOff";
  }
}

function statusBadgeClass(status: ProviderPromotionStatus): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800";
    case "scheduled":
      return "bg-blue-100 text-blue-800";
    case "expired":
    case "used_up":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-amber-100 text-amber-900";
  }
}

export default function ProviderPromotionsPage() {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const [promotions, setPromotions] = useState<ProviderPromotionDto[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPromo, setDetailPromo] = useState<ProviderPromotionDto | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  const [code, setCode] = useState("");
  const [promoType, setPromoType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [publicOnProfile, setPublicOnProfile] = useState(true);
  const [startDate, setStartDate] = useState(() => localYmd(new Date()));
  const [endDate, setEndDate] = useState(() => defaultEndYmd());
  const [noEndDate, setNoEndDate] = useState(false);
  const [usageLimit, setUsageLimit] = useState("");
  const [minPurchase, setMinPurchase] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [oncePerCustomer, setOncePerCustomer] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [promoIsActive, setPromoIsActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);

  const salonLocations = useMemo(
    () => locations.filter((l) => (l.location_type || "salon") !== "base"),
    [locations],
  );

  const createSummaryLine = useMemo(() => {
    if (!createOpen) return "";
    const num = parseFloat(value.replace(/,/g, "."));
    const discount =
      promoType === "percentage" && !Number.isNaN(num) && value.trim()
        ? `${num}% off`
        : !Number.isNaN(num) && value.trim()
          ? `${formatMoney(num)} off`
          : "—";
    const end = noEndDate
      ? t("web.provider.pages.promotions.noEndDate")
      : endDate
        ? t("web.provider.pages.promotions.endsLabel", { date: endDate })
        : "—";
    let line = t("web.provider.pages.promotions.summaryLine", { discount, end });
    if (oncePerCustomer) {
      line += ` · ${t("web.provider.pages.promotions.oncePerCustomer")}`;
    }
    return line;
  }, [createOpen, promoType, value, noEndDate, endDate, oncePerCustomer, formatMoney, t]);

  const detailSummaryLine = useMemo(() => {
    if (!detailPromo) return "";
    const discount =
      detailPromo.type === "percentage"
        ? `${detailPromo.value}% off`
        : `${formatMoney(detailPromo.value)} off`;
    const end = detailPromo.end_date
      ? t("web.provider.pages.promotions.endsLabel", { date: detailPromo.end_date })
      : t("web.provider.pages.promotions.noEndDate");
    let line = t("web.provider.pages.promotions.summaryLine", { discount, end });
    if (detailPromo.once_per_customer) {
      line += ` · ${t("web.provider.pages.promotions.oncePerCustomer")}`;
    }
    return line;
  }, [detailPromo, formatMoney, t]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: ProviderPromotionDto[] }>("/api/provider/promotions");
      setPromotions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    void fetcher
      .get<{ data: LocationRow[] }>("/api/provider/locations")
      .then((res) => setLocations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocations([]));
  }, [load]);

  const resetCreateForm = () => {
    setCode("");
    setValue("");
    setDescription("");
    setPublicOnProfile(true);
    setPromoType("percentage");
    setStartDate(localYmd(new Date()));
    setEndDate(defaultEndYmd());
    setNoEndDate(false);
    setUsageLimit("");
    setMinPurchase("");
    setMaxDiscount("");
    setOncePerCustomer(false);
    setLocationId("");
    setPromoIsActive(true);
  };

  const buildPayload = (forCreate: boolean) => {
    const payload: Record<string, unknown> = {
      description: description.trim() || undefined,
      public_on_profile: publicOnProfile,
      start_date: startDate,
      once_per_customer: oncePerCustomer,
    };
    if (noEndDate) {
      payload.no_end_date = true;
    } else if (endDate) {
      payload.end_date = endDate;
    } else if (forCreate) {
      payload.no_end_date = false;
      payload.end_date = defaultEndYmd();
    }
    if (forCreate) {
      if (usageLimit.trim()) payload.usage_limit = parseInt(usageLimit, 10);
      if (minPurchase.trim()) payload.min_purchase_amount = parseFloat(minPurchase.replace(/,/g, "."));
      if (maxDiscount.trim() && promoType === "percentage") {
        payload.max_discount_amount = parseFloat(maxDiscount.replace(/,/g, "."));
      }
      if (locationId) payload.location_id = locationId;
    } else {
      payload.usage_limit = usageLimit.trim() ? parseInt(usageLimit, 10) : null;
      payload.min_purchase_amount = minPurchase.trim()
        ? parseFloat(minPurchase.replace(/,/g, "."))
        : null;
      payload.max_discount_amount =
        promoType === "percentage"
          ? maxDiscount.trim()
            ? parseFloat(maxDiscount.replace(/,/g, "."))
            : null
          : null;
      payload.location_id = locationId || null;
      payload.is_active = promoIsActive;
    }
    return payload;
  };

  const handleCreate = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      toast.error(t("web.provider.pages.promotions.enterCode"));
      return;
    }
    const numValue = parseFloat(value.replace(/,/g, "."));
    if (Number.isNaN(numValue)) {
      toast.error(t("web.provider.pages.promotions.enterValidValue"));
      return;
    }
    if (promoType === "percentage" && (numValue < 0 || numValue > 100)) {
      toast.error(t("web.provider.pages.promotions.percentageRange"));
      return;
    }
    if (promoType === "fixed_amount" && numValue <= 0) {
      toast.error(t("web.provider.pages.promotions.enterFixedAmount"));
      return;
    }
    if (!noEndDate && endDate && startDate && endDate <= startDate) {
      toast.error(t("web.provider.pages.promotions.endAfterStart"));
      return;
    }
    try {
      setCreating(true);
      await fetcher.post("/api/provider/promotions", {
        code: trimmedCode,
        type: promoType,
        value: numValue,
        ...buildPayload(true),
      });
      toast.success(t("web.provider.pages.promotions.created"));
      setCreateOpen(false);
      resetCreateForm();
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.failedToCreate"));
    } finally {
      setCreating(false);
    }
  };

  const openDetail = async (p: ProviderPromotionDto) => {
    setDetailPromo(p);
    setStartDate(p.start_date ?? localYmd(new Date()));
    setEndDate(p.end_date ?? defaultEndYmd());
    setNoEndDate(!p.end_date);
    setUsageLimit(p.usage_limit != null ? String(p.usage_limit) : "");
    setMinPurchase(p.min_purchase_amount != null ? String(p.min_purchase_amount) : "");
    setMaxDiscount(p.max_discount_amount != null ? String(p.max_discount_amount) : "");
    setOncePerCustomer(p.once_per_customer);
    setLocationId(p.location_id ?? "");
    setDescription(p.description ?? "");
    setPublicOnProfile(p.public_on_profile !== false);
    setPromoIsActive(p.is_active);
    setPromoType(p.type);
    setValue(String(p.value));
    setRedemptions([]);
    setTotalDiscount(0);
    setRedemptionsLoading(true);
    try {
      const res = await fetcher.get<{
        data: { redemptions: RedemptionRow[]; total_discount: number };
      }>(`/api/provider/promotions/${p.id}/redemptions`);
      setRedemptions(res.data?.redemptions ?? []);
      setTotalDiscount(Number(res.data?.total_discount ?? 0));
    } catch {
      setRedemptions([]);
    } finally {
      setRedemptionsLoading(false);
    }
  };

  const saveDetail = async () => {
    if (!detailPromo) return;
    if (!noEndDate && endDate && startDate && endDate <= startDate) {
      toast.error(t("web.provider.pages.promotions.endAfterStart"));
      return;
    }
    try {
      setSavingDetail(true);
      await fetcher.patch(`/api/provider/promotions/${detailPromo.id}`, buildPayload(false));
      toast.success(t("web.provider.pages.promotions.savedOk"));
      setDetailPromo(null);
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.updateFailed"));
    } finally {
      setSavingDetail(false);
    }
  };

  const toggleActive = async (p: ProviderPromotionDto) => {
    try {
      await fetcher.patch(`/api/provider/promotions/${p.id}`, { is_active: !p.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.updateFailed"));
    }
  };

  const handleDelete = async (p: ProviderPromotionDto) => {
    if (!window.confirm(t("web.provider.pages.promotions.removeConfirm", { code: p.code }))) return;
    try {
      await fetcher.delete(`/api/provider/promotions/${p.id}`);
      toast.success(t("web.provider.pages.promotions.removed"));
      if (detailPromo?.id === p.id) setDetailPromo(null);
      await load();
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : t("web.provider.pages.promotions.deleteFailed");
      toast.error(msg.includes("used") ? t("web.provider.pages.promotions.deleteBlocked") : msg);
    }
  };

  const formatValue = (p: ProviderPromotionDto) =>
    p.type === "percentage" ? `${p.value}%` : formatMoney(p.value);

  const formatEndLabel = (p: ProviderPromotionDto) =>
    p.end_date
      ? t("web.provider.pages.promotions.endsLabel", { date: p.end_date })
      : t("web.provider.pages.promotions.noEndDate");

  const usageLabel = (p: ProviderPromotionDto) =>
    p.usage_limit != null
      ? t("web.provider.pages.promotions.usedCountMax", {
          count: p.usage_count,
          max: p.usage_limit,
        })
      : t("web.provider.pages.promotions.usesCount", { count: p.usage_count });

  const promoFormFields = (readOnlyTypeValue: boolean) => (
    <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pe-1">
      {!readOnlyTypeValue ? (
        <>
          <div>
            <Label htmlFor="promo-code">{t("web.provider.pages.promotions.code")}</Label>
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("web.provider.pages.promotions.placeholderCode")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("web.provider.common.type")}</Label>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={promoType}
                onChange={(e) => setPromoType(e.target.value as "percentage" | "fixed_amount")}
              >
                <option value="percentage">{t("web.provider.pages.promotions.percentage")}</option>
                <option value="fixed_amount">{t("web.provider.pages.promotions.fixedAmount")}</option>
              </select>
            </div>
            <div>
              <Label>{t("web.provider.pages.promotions.value")}</Label>
              <Input value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-700">
          {formatValue({ ...detailPromo!, type: promoType, value: Number(value) || detailPromo!.value })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("web.provider.pages.promotions.startsOn")}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("web.provider.pages.promotions.endsOn")}</Label>
          <Input
            type="date"
            value={endDate}
            disabled={noEndDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <Switch checked={noEndDate} onCheckedChange={setNoEndDate} />
            {t("web.provider.pages.promotions.noEndDate")}
          </label>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <p className="text-sm font-medium text-gray-900">{t("web.provider.pages.promotions.limitsSection")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("web.provider.pages.promotions.usageLimit")}</Label>
            <Input
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              placeholder={t("web.provider.pages.promotions.usageLimitPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("web.provider.pages.promotions.minPurchase")}</Label>
            <Input value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} />
          </div>
          {promoType === "percentage" ? (
            <div>
              <Label>{t("web.provider.pages.promotions.maxDiscount")}</Label>
              <Input value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
            </div>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={oncePerCustomer} onCheckedChange={setOncePerCustomer} />
          {t("web.provider.pages.promotions.oncePerCustomer")}
        </label>
        {salonLocations.length > 1 ? (
          <div>
            <Label>{t("web.provider.pages.promotions.branch")}</Label>
            <select
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">{t("web.provider.pages.promotions.branchAll")}</option>
              {salonLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div>
        <Label>{t("web.provider.pages.promotions.descriptionOptional")}</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      {readOnlyTypeValue ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={promoIsActive} onCheckedChange={setPromoIsActive} />
          {promoIsActive ? t("web.provider.common.active") : t("web.provider.pages.promotions.off")}
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={publicOnProfile} onCheckedChange={setPublicOnProfile} />
        {t("web.provider.pages.promotions.showOnProfile")}
      </label>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t("web.provider.pages.promotions.title")}
        subtitle={t("web.provider.pages.promotions.subtitle")}
        breadcrumbs={[
          { label: t("web.provider.common.more"), href: "/provider/more" },
          { label: t("web.provider.pages.promotions.title") },
        ]}
        actions={
          <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 me-2" />
            {t("web.provider.pages.promotions.newCode")}
          </Button>
        }
      />

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        {t("web.provider.pages.promotions.hint")}
      </div>

      {loading ? (
        <LoadingTimeout loadingMessage={t("web.provider.pages.promotions.loading")} />
      ) : promotions.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={t("web.provider.pages.promotions.emptyTitle")}
          description={t("web.provider.pages.promotions.emptyDesc")}
          action={{
            label: t("web.provider.pages.promotions.createPromoCode"),
            onClick: () => { resetCreateForm(); setCreateOpen(true); },
          }}
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {promotions.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
              <button
                type="button"
                className="flex flex-1 min-w-[140px] items-center gap-2 text-start hover:opacity-80"
                onClick={() => void openDetail(p)}
              >
                <div className="flex-1">
                  <p className="font-mono font-bold text-gray-900">{p.code}</p>
                  <p className="text-sm text-gray-600">
                    {formatValue(p)} · {formatEndLabel(p)} · {usageLabel(p)}
                  </p>
                  {p.description ? (
                    <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}
                >
                  {t(`web.provider.pages.promotions.${statusKey(p.status)}`)}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              </button>
              <div className="flex items-center gap-2">
                <Switch checked={p.is_active} onCheckedChange={() => void toggleActive(p)} />
                <span className="text-xs text-gray-500">
                  {p.is_active ? t("web.provider.common.active") : t("web.provider.pages.promotions.off")}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void handleDelete(p)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("web.provider.pages.promotions.createPromoCode")}</DialogTitle>
          </DialogHeader>
          {promoFormFields(false)}
          {createSummaryLine ? (
            <p className="text-sm text-gray-600 border-t pt-3">{createSummaryLine}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? t("web.provider.pages.promotions.creating") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailPromo} onOpenChange={(open) => !open && setDetailPromo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailPromo?.code ?? t("web.provider.pages.promotions.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detailPromo ? (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(detailPromo.code);
                    toast.success(t("web.provider.pages.promotions.copied"));
                  }}
                >
                  {t("web.provider.pages.promotions.copyCode")}
                </Button>
              </div>
              {detailSummaryLine ? (
                <p className="text-sm text-gray-600 mb-3">{detailSummaryLine}</p>
              ) : null}
              {promoFormFields(detailPromo.usage_count > 0)}
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  {t("web.provider.pages.promotions.redemptions")}
                </p>
                {redemptionsLoading ? (
                  <p className="text-xs text-gray-500">…</p>
                ) : redemptions.length === 0 ? (
                  <p className="text-xs text-gray-500">{t("web.provider.pages.promotions.noRedemptions")}</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-600 mb-2">
                      {t("web.provider.pages.promotions.totalDiscountGiven", {
                        amount: formatMoney(totalDiscount),
                      })}
                    </p>
                    <ul className="space-y-1 max-h-32 overflow-y-auto text-xs text-gray-700">
                      {redemptions.map((r, i) => (
                        <li key={`${r.used_at}-${i}`}>
                          {r.client_name} ·{" "}
                          {r.booking_number
                            ? t("web.provider.pages.promotions.redemptionBooking", {
                                number: r.booking_number,
                              })
                            : r.order_number
                              ? t("web.provider.pages.promotions.redemptionOrder", {
                                  number: r.order_number,
                                })
                              : "—"}{" "}
                          · {formatMoney(r.discount_amount)}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          ) : null}
          <DialogFooter>
            {detailPromo && detailPromo.usage_count === 0 ? (
              <Button variant="destructive" onClick={() => void handleDelete(detailPromo)}>
                {t("web.provider.common.delete")}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDetailPromo(null)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={() => void saveDetail()} disabled={savingDetail}>
              {savingDetail
                ? t("web.provider.common.saving")
                : t("web.provider.pages.promotions.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { Plus, Tag, Trash2 } from "lucide-react";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";

type Promotion = {
  id: string;
  code: string;
  type: string;
  value: number;
  description?: string | null;
  is_active: boolean;
  public_on_profile?: boolean;
  uses_count: number;
  max_uses?: number | null;
};

export default function ProviderPromotionsPage() {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [promoType, setPromoType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [publicOnProfile, setPublicOnProfile] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: Promotion[] }>("/api/provider/promotions");
      setPromotions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    try {
      setCreating(true);
      await fetcher.post("/api/provider/promotions", {
        code: trimmedCode,
        type: promoType,
        value: numValue,
        description: description.trim() || undefined,
        public_on_profile: publicOnProfile,
      });
      toast.success(t("web.provider.pages.promotions.created"));
      setCreateOpen(false);
      setCode("");
      setValue("");
      setDescription("");
      setPublicOnProfile(true);
      setPromoType("percentage");
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.failedToCreate"));
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (p: Promotion) => {
    try {
      await fetcher.patch(`/api/provider/promotions/${p.id}`, { is_active: !p.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.updateFailed"));
    }
  };

  const handleDelete = async (p: Promotion) => {
    if (!window.confirm(t("web.provider.pages.promotions.removeConfirm", { code: p.code }))) return;
    try {
      await fetcher.delete(`/api/provider/promotions/${p.id}`);
      toast.success(t("web.provider.pages.promotions.removed"));
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.promotions.deleteFailed"));
    }
  };

  const formatValue = (p: Promotion) =>
    p.type === "percentage" ? `${p.value}%` : formatMoney(p.value);

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
          <Button onClick={() => setCreateOpen(true)}>
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
          action={{ label: t("web.provider.pages.promotions.createPromoCode"), onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {promotions.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex-1 min-w-[140px]">
                <p className="font-mono font-bold text-gray-900">{p.code}</p>
                <p className="text-sm text-gray-600">
                  {formatValue(p)} · {t("web.provider.pages.promotions.usesCount", { count: p.uses_count })}
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={p.is_active} onCheckedChange={() => void toggleActive(p)} />
                <span className="text-xs text-gray-500">{p.is_active ? t("web.provider.common.active") : t("web.provider.pages.promotions.off")}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void handleDelete(p)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.provider.pages.promotions.createPromoCode")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
                  onChange={(e) =>
                    setPromoType(e.target.value as "percentage" | "fixed_amount")
                  }
                >
                  <option value="percentage">{t("web.provider.pages.promotions.percentage")}</option>
                  <option value="fixed_amount">{t("web.provider.pages.promotions.fixedAmount")}</option>
                </select>
              </div>
              <div>
                <Label>{t("web.provider.pages.promotions.value")}</Label>
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={promoType === "percentage" ? "10" : "50"}
                />
              </div>
            </div>
            <div>
              <Label>{t("web.provider.pages.promotions.descriptionOptional")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={publicOnProfile} onCheckedChange={setPublicOnProfile} />
              {t("web.provider.pages.promotions.showOnProfile")}
            </label>
          </div>
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
    </div>
  );
}

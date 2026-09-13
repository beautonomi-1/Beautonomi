"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

export default function ReceiptSequencingSettings() {
  const { t } = useTranslation();
  const [prefix, setPrefix] = useState("REC");
  const [nextNumber, setNextNumber] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetcher.get<{
          data: { receipt_prefix: string; receipt_next_number: number };
        }>("/api/provider/settings/sales/receipt");
        setPrefix(res.data.receipt_prefix || "REC");
        setNextNumber(Number(res.data.receipt_next_number || 1));
      } catch {
        toast.error(t("web.provider.settings.pages.sales/receipt-sequencing.failedToLoadReceiptSequencingSettings"));
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetcher.patch<{
        data: { receipt_prefix: string; receipt_next_number: number };
      }>("/api/provider/settings/sales/receipt", {
        receipt_prefix: prefix.trim() || "REC",
        receipt_next_number: Number(nextNumber || 1),
      });
      setPrefix(res.data.receipt_prefix || "REC");
      setNextNumber(Number(res.data.receipt_next_number || 1));
      toast.success(t("web.provider.settings.pages.sales/receipt-sequencing.receiptSequencingSaved"));
    } catch (e: any) {
toast.error(e?.message || t("web.provider.settings.pages.sales/receipt-sequencing.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.sales.items.receiptSequencing.title")}
      subtitle={t("web.provider.settings.categories.sales.items.receiptSequencing.description")}
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.sales/receipt-sequencing.sales"), href: "/provider/settings/sales/yoco-integration" },
        { label: t("web.provider.settings.pages.sales/receipt-sequencing.receiptSequencing") },
      ]}
    >

      <SectionCard>
        <div>
<Label>{t("web.provider.settings.pages.sales/receipt-sequencing.receiptPrefix")}</Label>
          <Input
            placeholder={t("web.provider.settings.pages.sales/receipt-sequencing.rec")}
            className="mt-2"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
        </div>

        <div>
<Label>{t("web.provider.settings.pages.sales/receipt-sequencing.startingNumber")}</Label>
          <Input
            type="number"
            placeholder="1"
            className="mt-2"
            min={1}
            value={nextNumber}
            onChange={(e) => setNextNumber(Number(e.target.value))}
          />
        </div>

      </SectionCard>
    </SettingsDetailLayout>
  );
}

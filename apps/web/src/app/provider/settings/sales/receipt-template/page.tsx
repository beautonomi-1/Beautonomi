"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface ReceiptData {
  receipt_header: string | null;
  receipt_footer: string | null;
  receipt_prefix?: string;
  receipt_next_number?: number;
}

export default function ReceiptTemplateSettings() {
  const { t } = useTranslation();
  const [header, setHeader] = useState<string>("");
  const [footer, setFooter] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("REC");
  const [nextNumber, setNextNumber] = useState<string>("1");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetcher.get<{ data: ReceiptData }>("/api/provider/settings/sales/receipt");
        setHeader(res.data.receipt_header || "");
        setFooter(res.data.receipt_footer || "");
        setPrefix(res.data.receipt_prefix || "REC");
        setNextNumber(String(res.data.receipt_next_number || 1));
      } catch {
        toast.error(t("web.provider.settings.pages.sales/receipt-template.failedToLoadReceiptSettings"));
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const onSave = async () => {
    const num = parseInt(nextNumber);
    if (isNaN(num) || num < 1) {
      toast.error(t("web.provider.settings.pages.sales/receipt-template.nextReceiptNumberMustBeAt"));
      return;
    }
    if (prefix.length > 20) {
      toast.error(t("web.provider.settings.pages.sales/receipt-template.receiptPrefixMustBe20Characters"));
      return;
    }
    try {
      setIsSaving(true);
      const res = await fetcher.patch<{ data: ReceiptData }>("/api/provider/settings/sales/receipt", {
        receipt_header: header ? header : null,
        receipt_footer: footer ? footer : null,
        receipt_prefix: prefix.trim() || "REC",
        receipt_next_number: num,
      });
      setHeader(res.data.receipt_header || "");
      setFooter(res.data.receipt_footer || "");
      setPrefix(res.data.receipt_prefix || "REC");
      setNextNumber(String(res.data.receipt_next_number || 1));
      toast.success(t("web.provider.settings.pages.sales/receipt-template.receiptTemplateSaved"));
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/receipt-template.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  const previewNumber = `${prefix}-${String(parseInt(nextNumber) || 1).padStart(5, "0")}`;

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.sales.items.receiptTemplate.title")}
      subtitle={t("web.provider.settings.categories.sales.items.receiptTemplate.description")}
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.sales/receipt-template.sales"), href: "/provider/settings/sales/yoco-integration" },
        { label: t("web.provider.settings.pages.sales/receipt-template.receiptTemplate") },
      ]}
    >
      {isLoading ? (
        <SectionCard>
<div className="text-center py-8 text-gray-500">{t("web.provider.settings.pages.sales/receipt-template.loading")}</div>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <SectionCard>
            <div className="space-y-4">
              <div>
<Label>{t("web.provider.settings.pages.sales/receipt-template.header")}</Label>
                <Textarea
                  placeholder={t("web.provider.settings.pages.sales/receipt-template.businessNameAddressRegistrationDetails")}
                  className="mt-2"
                  rows={3}
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                />
<p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.sales/receipt-template.charCount", { count: header.length })}</p>
              </div>

              <div>
<Label>{t("web.provider.settings.pages.sales/receipt-template.footer")}</Label>
                <Textarea
                  placeholder={t("web.provider.settings.pages.sales/receipt-template.thankYouMessageReturnPolicyTerms")}
                  className="mt-2"
                  rows={3}
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                />
<p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.sales/receipt-template.charCount", { count: footer.length })}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
<h3 className="text-sm font-semibold text-gray-900 mb-4">{t("web.provider.settings.pages.sales/receipt-template.numbering")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
<Label>{t("web.provider.settings.pages.sales/receipt-template.prefix")}</Label>
                <Input
                  className="mt-1"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder={t("web.provider.settings.pages.sales/receipt-template.rec")}
                  maxLength={20}
                />
<p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.sales/receipt-template.upTo20")}</p>
              </div>
              <div>
<Label>{t("web.provider.settings.pages.sales/receipt-template.nextNumber")}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  value={nextNumber}
                  onChange={(e) => setNextNumber(e.target.value)}
                  placeholder="1"
                />
<p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.sales/receipt-template.nextReceipt")} <span className="font-mono">{previewNumber}</span></p>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </SettingsDetailLayout>
  );
}

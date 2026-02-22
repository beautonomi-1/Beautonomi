"use client";

import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

export default function ReceiptTemplateSettings() {
  const [header, setHeader] = useState<string>("");
  const [footer, setFooter] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetcher.get<{
          data: { receipt_header: string | null; receipt_footer: string | null };
        }>("/api/provider/settings/sales/receipt");
        setHeader(res.data.receipt_header || "");
        setFooter(res.data.receipt_footer || "");
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetcher.patch<{
        data: { receipt_header: string | null; receipt_footer: string | null };
      }>("/api/provider/settings/sales/receipt", {
        receipt_header: header ? header : null,
        receipt_footer: footer ? footer : null,
      });
      setHeader(res.data.receipt_header || "");
      setFooter(res.data.receipt_footer || "");
      toast.success("Receipt template saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save receipt template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title="Receipt Template"
      subtitle="Customize your receipt design"
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
        { label: "Receipt Template" },
      ]}
    >

      <SectionCard>
        <div>
          <Label>Receipt Header</Label>
          <Textarea
            placeholder="Enter receipt header text..."
            className="mt-2"
            rows={3}
            value={header}
            onChange={(e) => setHeader(e.target.value)}
          />
        </div>

        <div>
          <Label>Receipt Footer</Label>
          <Textarea
            placeholder="Enter receipt footer text..."
            className="mt-2"
            rows={3}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
          />
        </div>

      </SectionCard>
    </SettingsDetailLayout>
  );
}

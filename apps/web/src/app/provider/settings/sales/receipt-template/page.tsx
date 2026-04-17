"use client";

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
        toast.error("Failed to load receipt settings");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const onSave = async () => {
    const num = parseInt(nextNumber);
    if (isNaN(num) || num < 1) {
      toast.error("Next receipt number must be at least 1");
      return;
    }
    if (prefix.length > 20) {
      toast.error("Receipt prefix must be 20 characters or less");
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
      toast.success("Receipt template saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save receipt template");
    } finally {
      setIsSaving(false);
    }
  };

  const previewNumber = `${prefix}-${String(parseInt(nextNumber) || 1).padStart(5, "0")}`;

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
      {isLoading ? (
        <SectionCard>
          <div className="text-center py-8 text-gray-500">Loading receipt settings...</div>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label>Receipt Header</Label>
                <Textarea
                  placeholder="Business name, address, registration details..."
                  className="mt-2"
                  rows={3}
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">{header.length}/2000 characters</p>
              </div>

              <div>
                <Label>Receipt Footer</Label>
                <Textarea
                  placeholder="Thank you message, return policy, terms..."
                  className="mt-2"
                  rows={3}
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">{footer.length}/2000 characters</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Receipt Numbering</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Prefix</Label>
                <Input
                  className="mt-1"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="REC"
                  maxLength={20}
                />
                <p className="text-xs text-gray-500 mt-1">Up to 20 characters</p>
              </div>
              <div>
                <Label>Next Number</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={1}
                  value={nextNumber}
                  onChange={(e) => setNextNumber(e.target.value)}
                  placeholder="1"
                />
                <p className="text-xs text-gray-500 mt-1">Next receipt: <span className="font-mono">{previewNumber}</span></p>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </SettingsDetailLayout>
  );
}

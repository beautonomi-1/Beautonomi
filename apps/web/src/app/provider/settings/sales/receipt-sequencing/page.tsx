"use client";

import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

export default function ReceiptSequencingSettings() {
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
        // keep defaults
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
      toast.success("Receipt sequencing saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save receipt sequencing");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title="Receipt Sequencing"
      subtitle="Configure receipt numbering"
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
        { label: "Receipt Sequencing" },
      ]}
    >

      <SectionCard>
        <div>
          <Label>Receipt Prefix</Label>
          <Input
            placeholder="REC"
            className="mt-2"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
        </div>

        <div>
          <Label>Starting Number</Label>
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

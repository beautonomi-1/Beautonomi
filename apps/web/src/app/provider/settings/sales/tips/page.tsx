"use client";

import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import Link from "next/link";

export default function TipsSettings() {
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetcher.get<{ data: { tips_enabled: boolean } }>(
          "/api/provider/settings/sales/tips"
        );
        setTipsEnabled(Boolean(res.data.tips_enabled));
      } catch {
        toast.error("Failed to load tip settings");
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetcher.patch<{ data: { tips_enabled: boolean } }>(
        "/api/provider/settings/sales/tips",
        { tips_enabled: Boolean(tipsEnabled) }
      );
      setTipsEnabled(Boolean(res.data.tips_enabled));
      toast.success("Tip settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save tip settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title="Tips"
      subtitle="Manage tip settings"
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
        { label: "Tips" },
      ]}
    >

      <SectionCard>
        <div className="space-y-5">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-950">Tips are on by default for every provider.</p>
            <p className="mt-1 text-sm text-emerald-800">
              Solo providers keep tips by default. Salons can choose whether tips stay with the business
              or are allocated to the staff member assigned to the booking.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Enable Tips</Label>
              <p className="text-sm text-gray-600">Allow customers to add tips during checkout</p>
            </div>
            <Switch checked={tipsEnabled} onCheckedChange={setTipsEnabled} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/provider/settings/tips/distribution"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
              Tip distribution
              <span className="mt-1 block text-xs font-normal text-gray-500">
                Decide who receives tips for staff-assigned bookings
              </span>
            </Link>
            <Link
              href="/provider/settings/payments"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
              Payment settings
              <span className="mt-1 block text-xs font-normal text-gray-500">
                Review tip presets and checkout payment methods
              </span>
            </Link>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}

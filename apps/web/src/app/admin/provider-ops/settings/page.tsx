"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Settings2, Save, Clock, UserCheck, Bell } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";

interface OpsSettings {
  stall_threshold_hours: number;
  dropoff_threshold_hours: number;
  auto_assign_enabled: boolean;
  auto_sms_on_stall: boolean;
  sla_contact_stalled_hours: number;
  sla_contact_dropped_hours: number;
}

export default function ProviderOpsSettingsPage() {
  const [settings, setSettings] = useState<OpsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetcher.get<{ data: OpsSettings }>(
          "/api/admin/provider-ops/settings",
          { staleTimeMs: 0 }
        );
        setSettings(res.data);
      } catch {
        setLoadError("Failed to load settings");
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetcher.patch<{ data: OpsSettings }>(
        "/api/admin/provider-ops/settings",
        settings
      );
      setSettings(res.data);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <LoadingTimeout loadingMessage="Loading settings..." />
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">{loadError || "Failed to load settings"}</p>
        <Link href="/admin/provider-ops" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Back to Provider Ops
        </Link>
      </div>
    );
  }

  function update(key: keyof OpsSettings, value: number | boolean) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 px-4 md:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/admin/provider-ops"
              className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-3 w-3" /> Provider Ops
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <Settings2 className="h-6 w-6 text-blue-600" />
              Provider Ops Settings
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium w-full sm:w-auto"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Stall Detection */}
        <div className="bg-white border rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Stall Detection Thresholds
          </h2>
          <p className="text-xs text-zinc-500 -mt-3">
            Configure when signups are classified as slowing, stalled, or
            dropped off based on inactivity duration.
          </p>

          <NumberField
            label="Stall threshold (hours)"
            description="Hours of inactivity before a signup is flagged as 'stalled'."
            value={settings.stall_threshold_hours}
            onChange={(v) => update("stall_threshold_hours", v)}
            min={1}
          />

          <NumberField
            label="Drop-off threshold (hours)"
            description="Hours of inactivity before a signup is flagged as 'dropped off'. Must be greater than stall threshold."
            value={settings.dropoff_threshold_hours}
            onChange={(v) => update("dropoff_threshold_hours", v)}
            min={settings.stall_threshold_hours + 1}
          />
        </div>

        {/* Auto-Assignment */}
        <div className="bg-white border rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-green-600" />
            Auto-Assignment
          </h2>

          <ToggleField
            label="Enable auto-assignment for stalled signups"
            description="Automatically assign unassigned stalled signups to available ops admins in a round-robin fashion."
            checked={settings.auto_assign_enabled}
            onChange={(v) => update("auto_assign_enabled", v)}
          />
        </div>

        {/* SLA & Notifications */}
        <div className="bg-white border rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
            <Bell className="h-4 w-4 text-red-500" />
            SLA & Notification Rules
          </h2>
          <p className="text-xs text-zinc-500 -mt-3">
            Define how quickly assigned admins should contact stalled or dropped
            signups. These drive escalation banners in the tracker.
          </p>

          <NumberField
            label="SLA: Contact stalled signups within (hours)"
            description="After a signup is flagged as stalled, the assigned admin should contact them within this many hours."
            value={settings.sla_contact_stalled_hours}
            onChange={(v) => update("sla_contact_stalled_hours", v)}
            min={1}
          />

          <NumberField
            label="SLA: Contact dropped-off signups within (hours)"
            description="After a signup is flagged as dropped off, escalate if no admin contact within this many hours."
            value={settings.sla_contact_dropped_hours}
            onChange={(v) => update("sla_contact_dropped_hours", v)}
            min={1}
          />

          <ToggleField
            label="Send automated SMS on stall"
            description="When a signup stalls, automatically send a check-in SMS via Twilio. Requires Twilio to be configured in platform settings."
            checked={settings.auto_sms_on_stall}
            onChange={(v) => update("auto_sms_on_stall", v)}
          />
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  onChange,
  min,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <p className="text-xs text-zinc-400 mb-1">{description}</p>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-32 px-3 py-1.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
      />
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? "bg-blue-600" : "bg-zinc-300"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-zinc-700">{label}</p>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

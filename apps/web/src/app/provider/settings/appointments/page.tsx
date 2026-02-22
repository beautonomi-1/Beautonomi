"use client";

import React from "react";
import { useAppointmentSettings } from "@/hooks/useAppointmentSettings";
import { APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

const statusLabels: Record<string, string> = {
  pending: "Pending",
  booked: "Booked",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

export default function AppointmentSettingsPage() {
  const { settings, isLoading, error, updateSettings } = useAppointmentSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [isSaving, setIsSaving] = React.useState(false);
  const [originalSettings, setOriginalSettings] = React.useState(settings);

  // Update local settings when settings change
  React.useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
      setOriginalSettings(settings);
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateSettings(localSettings);
      setOriginalSettings(localSettings);
      toast.success("Appointment settings saved successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = originalSettings && JSON.stringify(localSettings) !== JSON.stringify(originalSettings);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Appointment Settings" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Appointment Settings"
        subtitle="Configure default appointment status and confirmation behavior"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading appointment settings..." />
      </SettingsDetailLayout>
    );
  }

  if (error && !originalSettings) {
    return (
      <SettingsDetailLayout
        title="Appointment Settings"
        subtitle="Configure default appointment status and confirmation behavior"
        breadcrumbs={breadcrumbs}
      >
        <EmptyState
          title="Failed to load settings"
          description={error}
          action={{
            label: "Retry",
            onClick: () => window.location.reload(),
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Appointment Settings"
      subtitle="Configure default appointment status and confirmation behavior"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Changes"}
      saveDisabled={isSaving || !hasChanges}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="w-full">
        <div className="space-y-6 sm:space-y-8">
          {/* Default Status Selection */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="default-status" className="text-base sm:text-lg font-medium block mb-2">
                Default Appointment Status
              </Label>
              <p className="text-sm text-gray-600 mb-4">
                Choose the default status for new appointments when they are created
              </p>
              <Select
                value={localSettings?.defaultAppointmentStatus || APPOINTMENT_STATUS.BOOKED}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, defaultAppointmentStatus: value })
                }
              >
                <SelectTrigger id="default-status" className="w-full sm:w-auto min-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPOINTMENT_STATUS).map(([key, value]) => (
                    <SelectItem key={key} value={value}>
                      {statusLabels[value] || value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs sm:text-sm text-gray-500 mt-2">
                New appointments will be created with this status unless specified otherwise
              </p>
            </div>
          </div>

          {/* Auto-Confirm Switch */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="auto-confirm" className="text-base sm:text-lg font-medium block mb-2">
                  Auto-Confirm Appointments
                </Label>
                <p className="text-sm text-gray-600">
                  Automatically confirm appointments when they are created (if default status is "Pending")
                </p>
              </div>
              <div className="flex-shrink-0">
                <Switch
                  id="auto-confirm"
                  checked={localSettings?.autoConfirmAppointments || false}
                  onCheckedChange={(checked) =>
                    setLocalSettings({ ...localSettings, autoConfirmAppointments: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Require Confirmation Switch */}
          <div className="border-t pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="require-confirmation" className="text-base sm:text-lg font-medium block mb-2">
                  Require Confirmation
                </Label>
                <p className="text-sm text-gray-600">
                  Require manual confirmation before appointments are marked as "Booked"
                </p>
              </div>
              <div className="flex-shrink-0">
                <Switch
                  id="require-confirmation"
                  checked={localSettings?.requireConfirmationForBookings || false}
                  onCheckedChange={(checked) =>
                    setLocalSettings({ ...localSettings, requireConfirmationForBookings: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Info Alert */}
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-800">
              These settings apply to all new appointments created through the provider portal.
              Existing appointments are not affected.
            </AlertDescription>
          </Alert>

          {/* Last Updated */}
          {localSettings?.updatedAt && (
            <p className="text-xs text-gray-500 text-center pt-4 border-t">
              Last updated: {new Date(localSettings.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}

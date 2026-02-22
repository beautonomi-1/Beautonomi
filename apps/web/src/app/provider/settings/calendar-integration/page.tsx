"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { providerApi } from "@/lib/provider-portal/api";
import type { CalendarSync, CalendarProvider } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/provider/SectionCard";
import { Plus, Trash2, RefreshCw, Calendar } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";

export default function CalendarIntegrationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [syncs, setSyncs] = useState<CalendarSync[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [_selectedProvider, _setSelectedProvider] = useState<CalendarProvider | null>(null);
  const [_enabledProviders, setEnabledProviders] = useState<string[]>([]);

  // Check for OAuth callback results
  useEffect(() => {
    const success = searchParams?.get("success");
    const error = searchParams?.get("error");
    const provider = searchParams?.get("provider");

    if (success === "true" && provider) {
      toast.success(`${provider} calendar connected successfully`);
      loadSyncs();
      // Clean URL
      router.replace("/provider/settings/calendar-integration");
    } else if (error) {
      toast.error(`Failed to connect calendar: ${error}`);
      router.replace("/provider/settings/calendar-integration");
    }
  }, [searchParams, router]);

  const loadSyncs = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCalendarSyncs();
      setSyncs(data);
      
      // Load enabled providers
      try {
        const { fetcher } = await import("@/lib/http/fetcher");
        const result = await fetcher.get<{ data: { providers?: string[] } }>("/api/provider/calendar/providers");
        setEnabledProviders(result.data?.providers || []);
      } catch (error) {
        console.warn("Failed to load enabled providers, showing all:", error);
        // If we can't load enabled providers, show all by default
        setEnabledProviders(["google", "outlook", "apple"]);
      }
    } catch (error) {
      console.error("Failed to load calendar syncs:", error);
      toast.error("Failed to load calendar integrations");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSyncs();
  }, [loadSyncs]);

  const _handleConnect = async (provider: CalendarProvider) => {
    try {
      const { url } = await providerApi.getCalendarAuthUrl(provider);
      // Redirect to OAuth URL (will redirect back after auth)
      window.location.href = url;
    } catch (error: any) {
      console.error("Failed to initiate calendar connection:", error);
      const errorMessage = error?.error?.message || error?.message || "Failed to connect calendar";
      const errorCode = error?.error?.code;
      
      if (errorCode === "CONFIG_ERROR") {
        toast.error(
          "Calendar integration is not configured. Please contact your administrator to set up OAuth credentials.",
          { duration: 8000 }
        );
      } else if (errorCode === "INTEGRATION_DISABLED") {
        toast.error(
          errorMessage || "This calendar provider is not enabled. Please contact your administrator.",
          { duration: 8000 }
        );
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this calendar?")) return;

    try {
      await providerApi.deleteCalendarSync(id);
      toast.success("Calendar disconnected");
      loadSyncs();
    } catch (error) {
      console.error("Failed to disconnect calendar:", error);
      toast.error("Failed to disconnect calendar");
    }
  };

  const handleSync = async (sync: CalendarSync) => {
    try {
      toast.info("Syncing calendar...");
      await providerApi.syncCalendarToAppointments(sync.id);
      toast.success("Calendar synced successfully");
      loadSyncs();
    } catch (error) {
      console.error("Failed to sync calendar:", error);
      toast.error("Failed to sync calendar");
    }
  };

  const getProviderName = (provider: CalendarProvider) => {
    switch (provider) {
      case "google":
        return "Google Calendar";
      case "apple":
        return "Apple Calendar (iCal)";
      case "outlook":
        return "Microsoft Outlook";
    }
  };

  const getProviderIcon = (_provider: CalendarProvider) => {
    return <Calendar className="w-5 h-5" />;
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading calendar integrations..." />;
  }

  return (
    <div>
      <PageHeader
        title="Calendar Integration"
        subtitle="Sync your appointments with external calendars"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Calendar Integration" },
        ]}
        primaryAction={{
          label: "Connect Calendar",
          onClick: () => setIsDialogOpen(true),
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {syncs.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No calendar integrations"
            description="Connect your calendar to sync appointments automatically"
            action={{
              label: "Connect Calendar",
              onClick: () => setIsDialogOpen(true),
            }}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {syncs.map((sync) => (
            <SectionCard key={sync.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getProviderIcon(sync.provider)}
                  <div>
                    <h3 className="font-semibold">{getProviderName(sync.provider)}</h3>
                    <p className="text-sm text-gray-600">
                      {sync.sync_direction === "two_way" ? "Two-way sync" : "One-way sync"}
                    </p>
                  </div>
                </div>
                {sync.is_active ? (
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
                )}
              </div>

              {sync.last_sync_date && (
                <div className="mb-4 text-sm text-gray-600">
                  <p>Last synced: {format(new Date(sync.last_sync_date), "PPp")}</p>
                </div>
              )}

              {sync.sync_errors && sync.sync_errors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800 mb-1">Sync Errors:</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {sync.sync_errors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync(sync)}
                  disabled={!sync.is_active}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDisconnect(sync.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <ConnectCalendarDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={loadSyncs}
      />
    </div>
  );
}

// Connect Calendar Dialog
function ConnectCalendarDialog({
  open,
  onOpenChange,
  onSuccess: _onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<CalendarProvider>("google");
  const [syncDirection, setSyncDirection] = useState<"one_way" | "two_way">("two_way");
  const [isConnecting, setIsConnecting] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  
  // Load enabled providers when dialog opens
  useEffect(() => {
    if (open) {
      import("@/lib/http/fetcher").then(({ fetcher }) =>
        fetcher.get<{ data: { providers?: string[] } }>("/api/provider/calendar/providers")
      )
        .then((result) => {
          const providers = result.data?.providers || [];
          setEnabledProviders(providers);
          // Set default provider to first enabled one
          if (providers.length > 0 && !providers.includes(selectedProvider)) {
            setSelectedProvider(providers[0] as CalendarProvider);
          }
        })
        .catch((error) => {
          console.warn("Failed to load enabled providers:", error);
          // Default to all providers if we can't load
          setEnabledProviders(["google", "outlook", "apple"]);
        });
    }
  }, [open, selectedProvider]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { url } = await providerApi.getCalendarAuthUrl(selectedProvider);
      // Redirect to OAuth URL
      window.location.href = url;
    } catch (error: any) {
      console.error("Failed to connect calendar:", error);
      const errorMessage = error?.error?.message || error?.message || "Failed to connect calendar";
      const errorCode = error?.error?.code;
      
      if (errorCode === "CONFIG_ERROR") {
        toast.error(
          "Calendar integration is not configured. Please contact your administrator to set up OAuth credentials.",
          { duration: 8000 }
        );
      } else if (errorCode === "INTEGRATION_DISABLED") {
        toast.error(
          errorMessage || "This calendar provider is not enabled. Please contact your administrator.",
          { duration: 8000 }
        );
      } else {
        toast.error(errorMessage);
      }
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Calendar</DialogTitle>
          <DialogDescription>
            Choose a calendar provider to sync your appointments
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="provider">Calendar Provider</Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) => setSelectedProvider(value as CalendarProvider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enabledProviders.includes("google") && (
                  <SelectItem value="google">Google Calendar</SelectItem>
                )}
                {enabledProviders.includes("outlook") && (
                  <SelectItem value="outlook">Microsoft Outlook</SelectItem>
                )}
                {enabledProviders.includes("apple") && (
                  <SelectItem value="apple">Apple Calendar (iCal)</SelectItem>
                )}
                {enabledProviders.length === 0 && (
                  <SelectItem value="none" disabled>
                    No calendar providers enabled
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Sync Direction</Label>
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="two_way"
                  checked={syncDirection === "two_way"}
                  onCheckedChange={(checked) =>
                    setSyncDirection(checked ? "two_way" : "one_way")
                  }
                />
                <Label htmlFor="two_way" className="cursor-pointer">
                  Two-way sync (recommended)
                </Label>
              </div>
              <p className="text-xs text-gray-500 ml-6">
                Changes in either calendar will sync to the other
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="one_way"
                  checked={syncDirection === "one_way"}
                  onCheckedChange={(checked) =>
                    setSyncDirection(checked ? "one_way" : "two_way")
                  }
                />
                <Label htmlFor="one_way" className="cursor-pointer">
                  One-way sync (appointments → calendar only)
                </Label>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Appointments will automatically sync to your calendar</li>
              <li>You can view and manage appointments from your calendar app</li>
              <li>Changes made in your calendar can sync back (two-way only)</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConnecting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-[#FF0077] hover:bg-[#D60565]"
          >
            {isConnecting ? "Connecting..." : "Connect Calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

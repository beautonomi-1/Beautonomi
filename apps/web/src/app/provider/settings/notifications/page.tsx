"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Calendar, DollarSign, Star, Users, AlertCircle, Clock, FileText, TrendingUp, Wallet } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface NotificationPreferences {
  booking_updates?: { email: boolean; sms: boolean; push: boolean };
  booking_cancellations?: { email: boolean; sms: boolean; push: boolean };
  booking_reminders?: { email: boolean; sms: boolean; push: boolean };
  new_reviews?: { email: boolean; sms: boolean; push: boolean };
  review_responses?: { email: boolean; sms: boolean; push: boolean };
  client_messages?: { email: boolean; sms: boolean; push: boolean };
  payment_received?: { email: boolean; sms: boolean; push: boolean };
  payout_updates?: { email: boolean; sms: boolean; push: boolean };
  waitlist_notifications?: { email: boolean; sms: boolean; push: boolean };
  system_updates?: { email: boolean; sms: boolean; push: boolean };
  marketing?: { email: boolean; sms: boolean; push: boolean };
  unsubscribe_marketing?: boolean;
}

const notificationSections = [
  {
    id: "booking_updates",
    title: "Booking Updates",
    description: "Get notified when bookings are created, updated, or rescheduled",
    icon: Calendar,
  },
  {
    id: "booking_cancellations",
    title: "Booking Cancellations",
    description: "Be notified when clients cancel their appointments",
    icon: AlertCircle,
  },
  {
    id: "booking_reminders",
    title: "Booking Reminders",
    description: "Receive reminders about upcoming appointments",
    icon: Clock,
  },
  {
    id: "new_reviews",
    title: "New Reviews",
    description: "Get notified when customers leave reviews",
    icon: Star,
  },
  {
    id: "review_responses",
    title: "Review Responses",
    description: "Notifications about review interactions",
    icon: MessageSquare,
  },
  {
    id: "client_messages",
    title: "Client Messages",
    description: "Stay updated on messages from clients",
    icon: MessageSquare,
  },
  {
    id: "payment_received",
    title: "Payment Received",
    description: "Get notified when payments are received",
    icon: DollarSign,
  },
  {
    id: "payout_updates",
    title: "Payout Updates",
    description: "Updates on payout requests and processing",
    icon: Wallet,
  },
  {
    id: "waitlist_notifications",
    title: "Waitlist Notifications",
    description: "Get notified about waitlist activity",
    icon: Users,
  },
  {
    id: "system_updates",
    title: "System Updates",
    description: "Important system announcements and updates",
    icon: FileText,
  },
  {
    id: "marketing",
    title: "Marketing & Promotions",
    description: "Receive marketing emails and promotional offers",
    icon: TrendingUp,
  },
];

export default function ProviderNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: NotificationPreferences }>(
        "/api/provider/notification-preferences"
      );
      setPreferences(response.data || {});
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load notification preferences";
      setError(errorMessage);
      console.error("Error loading notification preferences:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = async (sectionId: string, prefs: { email: boolean; sms: boolean; push: boolean }) => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/notification-preferences", {
        [sectionId]: prefs,
      });
      
      setPreferences((prev) => ({
        ...prev,
        [sectionId]: prefs,
      }));
      
      toast.success("Notification preferences updated");
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : "Failed to update preferences";
      toast.error(errorMessage);
      console.error("Error updating preferences:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePreference = (sectionId: string, channel: 'email' | 'sms' | 'push') => {
    const currentPrefs = preferences[sectionId as keyof NotificationPreferences] as { email: boolean; sms: boolean; push: boolean } || { email: true, sms: true, push: false };
    const newPrefs = {
      ...currentPrefs,
      [channel]: !currentPrefs[channel],
    };
    updatePreference(sectionId, newPrefs);
  };

  const toggleMarketing = async () => {
    try {
      setIsSaving(true);
      const newValue = !preferences.unsubscribe_marketing;
      await fetcher.patch("/api/provider/notification-preferences", {
        unsubscribe_marketing: newValue,
      });
      
      setPreferences((prev) => ({
        ...prev,
        unsubscribe_marketing: newValue,
      }));
      
      toast.success(newValue ? "Unsubscribed from marketing" : "Subscribed to marketing");
    } catch {
      toast.error("Failed to update marketing preferences");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Notifications" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading notification preferences..." />
      </SettingsDetailLayout>
    );
  }

  if (error) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Notifications" },
        ]}
      >
        <EmptyState
          title="Failed to load preferences"
          description={error}
          action={{
            label: "Retry",
            onClick: loadPreferences,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Notifications" },
      ]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Notification Preferences"
          subtitle="Choose how you want to be notified about important events"
        />

        {/* Marketing Unsubscribe */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">Marketing Communications</h3>
              <p className="text-sm text-gray-600">
                Unsubscribe from marketing emails and promotional offers
              </p>
            </div>
            <Switch
              checked={preferences.unsubscribe_marketing || false}
              onCheckedChange={toggleMarketing}
              disabled={isSaving}
              className="data-[state=checked]:bg-[#FF0077]"
            />
          </div>
        </div>

        {/* Notification Sections */}
        <div className="space-y-4">
          {notificationSections.map((section) => {
            const Icon = section.icon;
            const sectionPrefs = preferences[section.id as keyof NotificationPreferences] as { email: boolean; sms: boolean; push: boolean } || { email: true, sms: true, push: false };

            return (
              <div key={section.id} className="bg-white border rounded-lg p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-2 bg-[#FF0077]/10 rounded-lg">
                    <Icon className="w-5 h-5 text-[#FF0077]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{section.title}</h3>
                    <p className="text-sm text-gray-600">{section.description}</p>
                  </div>
                </div>

                <div className="space-y-3 pl-14">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">Email</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.email}
                      onCheckedChange={() => togglePreference(section.id, 'email')}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-[#FF0077]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">SMS</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.sms}
                      onCheckedChange={() => togglePreference(section.id, 'sms')}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-[#FF0077]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">Push Notifications</span>
                    </div>
                    <Switch
                      checked={sectionPrefs.push}
                      onCheckedChange={() => togglePreference(section.id, 'push')}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-[#FF0077]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SettingsDetailLayout>
  );
}

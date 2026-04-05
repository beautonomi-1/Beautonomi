"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Gift, FileText, AlertCircle, Clock, HelpCircle } from "lucide-react";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

const tabs = [
  { value: "offersUpdates", label: "Offers and updates" },
  { value: "account", label: "Account" },
];

interface NotificationPreferences {
  inspiration_and_offers?: { email: boolean; sms: boolean; push: boolean };
  news_and_programs?: { email: boolean; sms: boolean; push: boolean };
  feedback?: { email: boolean; sms: boolean; push: boolean };
  travel_regulations?: { email: boolean; sms: boolean; push: boolean };
  account_activity?: { email: boolean; sms: boolean; push: boolean };
  client_policies?: { email: boolean; sms: boolean; push: boolean };
  reminders?: { email: boolean; sms: boolean; push: boolean };
  subscription_renewal?: { email: boolean; sms: boolean; push: boolean };
  messages?: { email: boolean; sms: boolean; push: boolean };
  unsubscribe_marketing?: boolean;
}

/** Sections for the "Offers and updates" tab */
const offersUpdatesSections = [
  {
    id: "inspiration_and_offers",
    title: "Inspiration and offers",
    description: "News, tips, and offers from Beautonomi.",
    icon: Gift,
  },
  {
    id: "news_and_programs",
    title: "News and programs",
    description: "Stay in the know about brand new programs and announcements.",
    icon: FileText,
  },
];

/** Sections for the "Beautonomi updates" sub-group inside the Offers tab */
const beautonomiUpdatesSections = [
  {
    id: "feedback",
    title: "Feedback",
    description: "Help us improve Beautonomi.",
    icon: AlertCircle,
  },
  {
    id: "travel_regulations",
    title: "Travel regulations",
    description: "Stay up to date on travel requirements.",
    icon: FileText,
  },
];

/** Sections for the "Account" tab */
const accountSections = [
  {
    id: "account_activity",
    title: "Account activity",
    description: "Confirm your account activity and learn about important Beautonomi policies.",
    icon: Bell,
  },
  {
    id: "client_policies",
    title: "Client policies",
    description: "Learn about important Beautonomi policies.",
    icon: FileText,
  },
  {
    id: "reminders",
    title: "Reminders",
    description: "Get important reminders about your upcoming bookings.",
    icon: Clock,
  },
  {
    id: "subscription_renewal",
    title: "Subscription renewal reminders",
    description: "Get notified before your subscription expires.",
    icon: Clock,
  },
  {
    id: "messages",
    title: "Messages",
    description: "Keep in touch with your beauty partner or clients.",
    icon: MessageSquare,
  },
];

/** All sections combined — used only for rendering modals */
const notificationSections = [
  ...offersUpdatesSections,
  ...beautonomiUpdatesSections,
  ...accountSections,
];

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  preferences?: { email?: boolean; sms?: boolean; push?: boolean };
  sectionId: string;
  onUpdate: (sectionId: string, prefs: { email: boolean; sms: boolean; push: boolean }) => Promise<void>;
}

const NotificationModal = ({
  isOpen,
  onClose,
  title,
  description,
  preferences,
  sectionId,
  onUpdate,
}: NotificationModalProps) => {
  const [localPrefs, setLocalPrefs] = useState<{ email: boolean; sms: boolean; push: boolean }>(
    preferences ? { email: preferences.email ?? true, sms: preferences.sms ?? true, push: preferences.push ?? false } : { email: true, sms: true, push: false }
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        email: preferences.email ?? true,
        sms: preferences.sms ?? true,
        push: preferences.push ?? false,
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(sectionId, localPrefs);
      toast.success("Notification preferences updated");
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update preferences");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="pt-5">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-500 font-light mb-4">{description}</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="font-medium">Email</span>
              </div>
              <Switch
                checked={localPrefs.email}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, email: checked })
                }
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                <span className="font-medium">SMS</span>
              </div>
              <Switch
                checked={localPrefs.sms}
                onCheckedChange={(checked) =>
                  setLocalPrefs({ ...localPrefs, sms: checked })
                }
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">Browser notifications</span>
                </div>
                <Switch
                  checked={localPrefs.push}
                  onCheckedChange={(checked) =>
                    setLocalPrefs({ ...localPrefs, push: checked })
                  }
                  className="data-[state=checked]:bg-primary"
                />
              </div>
              <p className="text-sm text-gray-500 font-light">
                {localPrefs.push
                  ? "We will send push alerts for this category when your device allows notifications from Beautonomi."
                  : "Turn this on to allow push alerts for this category. You may also need to allow notifications in your browser or device settings."}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary rounded-lg disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Page = () => {
  const [activeTab, setActiveTab] = useState("offersUpdates");
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribeMarketing, setUnsubscribeMarketing] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: NotificationPreferences }>(
        "/api/me/notification-preferences",
        { cache: "no-store" }
      );
      setPreferences(response.data || {});
      setUnsubscribeMarketing(response.data?.unsubscribe_marketing || false);
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
      await fetcher.patch("/api/me/notification-preferences", {
        [sectionId]: prefs,
      });
      setPreferences((prev) => ({ ...prev, [sectionId]: prefs }));
    } catch (error: unknown) {
      throw error;
    }
  };

  const handleUnsubscribeMarketing = async (checked: boolean) => {
    const previousValue = unsubscribeMarketing;
    setUnsubscribeMarketing(checked);
    try {
      await fetcher.patch("/api/me/notification-preferences", {
        unsubscribe_marketing: checked,
      });
      toast.success(checked ? "Unsubscribed from marketing emails" : "Subscribed to marketing emails");
    } catch (error: unknown) {
      setUnsubscribeMarketing(previousValue);
      toast.error(error instanceof Error ? error.message : "Failed to update preference");
    }
  };

  const getPreferenceStatus = (sectionId: string) => {
    const prefs = preferences[sectionId as keyof NotificationPreferences] as {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    } | undefined;
    if (!prefs) return "On: Email and SMS";
    const channels = [];
    if (prefs.email) channels.push("Email");
    if (prefs.sms) channels.push("SMS");
    if (prefs.push) channels.push("Push");
    return channels.length > 0 ? `On: ${channels.join(", ")}` : "Off";
  };

  const openModal = (id: string) => setActiveModal(id);
  const closeModal = () => setActiveModal(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading notification preferences..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <EmptyState
            title="Unable to load notification preferences"
            description={error}
            action={{ label: "Try Again", onClick: () => loadPreferences() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50">
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mt-8 mb-12"
        >
          <BackButton href="/account-settings" />
          <Breadcrumb
            items={[
              { label: "Account", href: "/account-settings" },
              { label: "Notifications" },
            ]}
          />

          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            className="text-2xl md:text-3xl font-semibold tracking-tighter text-gray-900 border-b border-gray-200 mb-6 pb-4 mt-4 md:mt-6"
          >
            Notifications
          </motion.h1>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 grid grid-cols-2 w-full h-auto p-1 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-sm md:text-base font-medium text-gray-700 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-white/40 data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-gray-200 rounded-lg transition-all duration-200"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="offersUpdates">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-6"
              >
                {offersUpdatesSections.map((section, index) => {
                  const Icon = section.icon;
                  return (
                    <motion.div
                      key={section.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * index, duration: 0.4, ease: "easeOut" }}
                      whileHover={{ scale: 1.01 }}
                      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                              <Icon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-base font-semibold text-gray-900">
                                {section.title}
                              </h3>
                              <p className="text-sm font-light text-gray-600 mb-2">
                                {getPreferenceStatus(section.id)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => openModal(section.id)}
                          className="text-primary hover:text-primary-hover font-medium text-sm underline transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    </motion.div>
                  );
                })}

                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-4">
                    Beautonomi updates
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    Stay up to date on the latest news from Beautonomi, and let us know how we can
                    improve.
                  </p>

                  {beautonomiUpdatesSections.map((section, index) => {
                    const Icon = section.icon;
                    return (
                      <motion.div
                        key={section.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * index, duration: 0.4, ease: "easeOut" }}
                        whileHover={{ scale: 1.01 }}
                        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mb-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                <Icon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-base font-semibold text-gray-900">
                                  {section.title}
                                </h3>
                                <p className="text-sm font-light text-gray-600 mb-2">
                                  {getPreferenceStatus(section.id)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => openModal(section.id)}
                            className="text-primary hover:text-primary-hover font-medium text-sm underline transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}

                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mt-6"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 mb-1">
                          Unsubscribe from all marketing emails
                        </h3>
                        <p className="text-sm font-light text-gray-600">
                          Stop receiving promotional emails from Beautonomi
                        </p>
                      </div>
                      <Switch
                        checked={unsubscribeMarketing}
                        onCheckedChange={handleUnsubscribeMarketing}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="account">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-lg rounded-2xl p-6 md:p-8 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                    Account activity and policies
                  </h2>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    Confirm your booking and account activity, and learn about important Beautonomi
                    policies.
                  </p>

                  {accountSections
                    .filter((s) => s.id === "account_activity" || s.id === "client_policies")
                    .map((section, index) => {
                      const Icon = section.icon;
                      return (
                        <motion.div
                          key={section.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 * index, duration: 0.4, ease: "easeOut" }}
                          whileHover={{ scale: 1.01 }}
                          className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mb-4"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                  <Icon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="text-base font-semibold text-gray-900">
                                    {section.title}
                                  </h3>
                                  <p className="text-sm font-light text-gray-600 mb-2">
                                    {getPreferenceStatus(section.id)}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => openModal(section.id)}
                              className="text-primary hover:text-primary-hover font-medium text-sm underline transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}

                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      Reminders
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      Get important reminders about your bookings, reservations, and account
                      activity.
                    </p>

                    {accountSections
                      .filter((s) => s.id === "reminders" || s.id === "subscription_renewal")
                      .map((section, index) => {
                        const Icon = section.icon;
                        return (
                          <motion.div
                            key={section.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * index, duration: 0.4, ease: "easeOut" }}
                            whileHover={{ scale: 1.01 }}
                            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5 mb-4"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                    <Icon className="w-5 h-5 text-primary" />
                                  </div>
                                  <div>
                                    <h3 className="text-base font-semibold text-gray-900">
                                      {section.title}
                                    </h3>
                                    <p className="text-sm font-light text-gray-600 mb-2">
                                      {getPreferenceStatus(section.id)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => openModal(section.id)}
                                className="text-primary hover:text-primary-hover font-medium text-sm underline transition-colors"
                              >
                                Edit
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 mb-2">
                      Messages
                    </h2>
                    <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                      Keep in touch with your Beauty Partner before and during your appointment.
                    </p>

                    {accountSections
                      .filter((s) => s.id === "messages")
                      .map((section) => {
                        const Icon = section.icon;
                        return (
                          <motion.div
                            key={section.id}
                            whileHover={{ scale: 1.01 }}
                            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-5"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                                    <Icon className="w-5 h-5 text-primary" />
                                  </div>
                                  <div>
                                    <h3 className="text-base font-semibold text-gray-900">
                                      {section.title}
                                    </h3>
                                    <p className="text-sm font-light text-gray-600 mb-2">
                                      {getPreferenceStatus(section.id)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => openModal(section.id)}
                                className="text-primary hover:text-primary-hover font-medium text-sm underline transition-colors"
                              >
                                Edit
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>
                </div>

                {/* Help Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                  className="pt-6 border-t border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                      <HelpCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-gray-900 mb-2">Need help?</h3>
                      <p className="text-sm font-light text-gray-600 mb-3">
                        Get answers to questions about notifications in our Help Center.
                      </p>
                      <a
                        href="/help"
                        className="text-sm font-medium text-primary hover:text-primary-hover underline transition-colors"
                      >
                        Visit Help Centre
                      </a>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </TabsContent>
          </Tabs>

          {notificationSections.map((section) => (
            <NotificationModal
              key={section.id}
              isOpen={activeModal === section.id}
              onClose={closeModal}
              title={section.title}
              description={section.description}
              preferences={
                preferences[section.id as keyof NotificationPreferences] as {
                  email: boolean;
                  sms: boolean;
                  push: boolean;
                }
              }
              sectionId={section.id}
              onUpdate={updatePreference}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default Page;

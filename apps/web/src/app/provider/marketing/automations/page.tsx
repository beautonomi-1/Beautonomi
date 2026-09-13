"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import type { Automation } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Info, Link as LinkIcon, Edit, History } from "lucide-react";
import { toast } from "sonner";
import NextLink from "next/link";
import { MessagePreviewDialog } from "./components/MessagePreviewDialog";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { getUpgradeMessage, isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function ProviderAutomations() {
  const { t } = useTranslation();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("reminders");
  const [smsBalance, setSmsBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  useEffect(() => {
    // Load automations and SMS balance in parallel
    Promise.all([
      loadAutomations().catch(() => {
        // Errors are handled in loadAutomations, just prevent unhandled promise rejection
      }),
      loadSmsBalance().catch(() => {
        // Errors are handled in loadSmsBalance, just prevent unhandled promise rejection
      }),
    ]);
  }, []);

  const loadSmsBalance = async () => {
    try {
      setIsLoadingBalance(true);
      const response = await fetcher.get<{ 
        data: { 
          balance: number | null; 
          estimatedMessagesRemaining: number | null;
          hasIntegration: boolean;
        } 
      }>("/api/provider/twilio-integration/balance", {
        timeoutMs: 10000,
      });
      
      if (response.data?.hasIntegration && response.data.estimatedMessagesRemaining !== null) {
        setSmsBalance(response.data.estimatedMessagesRemaining);
      } else {
        // Default to null if no integration or balance unavailable
        setSmsBalance(null);
      }
    } catch (error) {
      console.error("Failed to load SMS balance:", error);
      // Don't show error toast - balance is optional
      setSmsBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const loadAutomations = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: any[] }>("/api/provider/automations", {
        timeoutMs: 30000,
      });
      
      // Store raw data for template activation
      const rawAutomations = response.data || [];
      
      // Map database structure to Automation type
      const mappedAutomations: Automation[] = rawAutomations.map((auto: any) => {
        const isTemplate = auto.is_template === true;
        
        // Map trigger type to automation type
        const mapType = (triggerType: string): "reminder" | "update" | "booking" | "milestone" => {
          if (!triggerType) return "reminder";
          const type = triggerType.toLowerCase();
          if (type.includes("reminder") || type.includes("before")) return "reminder";
          if (type.includes("update") || type.includes("confirmed") || type.includes("cancelled") || 
              type.includes("rescheduled") || type.includes("no_show")) return "update";
          if (type.includes("booking") || type.includes("completed") || type.includes("inactive") || 
              type.includes("lead") || type.includes("package_expiring") || type.includes("seasonal")) return "booking";
          if (type.includes("birthday") || type.includes("anniversary") || type.includes("milestone") || 
              type.includes("visit_milestone") || type.includes("referral") || type.includes("holiday")) return "milestone";
          return "reminder";
        };
        
        // Format trigger display
        const formatTrigger = (triggerType: string, triggerConfig: any): string => {
          if (triggerConfig?.hours_before) {
            return t("web.provider.pages.marketing/automations.hoursBefore", { hours: triggerConfig.hours_before });
          }
          if (triggerConfig?.minutes_before) {
            const hours = Math.floor(triggerConfig.minutes_before / 60);
            const minutes = triggerConfig.minutes_before % 60;
            if (hours > 0 && minutes > 0) return t("web.provider.pages.marketing/automations.hoursMinutesBefore", { hours, minutes });
            if (hours > 0) return t("web.provider.pages.marketing/automations.hoursBefore", { hours });
            return t("web.provider.pages.marketing/automations.minutesBefore", { minutes });
          }
          return triggerType || "";
        };
        
        return {
          id: auto.id,
          name: auto.name,
          type: mapType(auto.trigger_type),
          trigger: formatTrigger(auto.trigger_type, auto.trigger_config),
          is_active: isTemplate ? false : (auto.is_active ?? true),
          description: auto.description || t("web.provider.pages.marketing/automations.automatedMessage"),
          is_template: isTemplate,
          // Store raw data for template activation
          _raw: auto,
        };
      });
      
      setAutomations(mappedAutomations);
      setSubscriptionRequired(false);
    } catch (error) {
      if (error instanceof FetchError && isPlanGateErrorCode(error.code)) {
        setSubscriptionRequired(true);
        setIsLoading(false);
        return;
      }
      console.error("Failed to load automations:", error);
      toastPlanGateError(error, t("web.provider.pages.marketing/automations.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutomation = async (id: string, isActive: boolean) => {
    try {
      // Find the automation in the current list to check if it's a template
      const automation = automations.find((a) => a.id === id);
      
      if (!automation) {
        toast.error(t("web.provider.pages.marketing/automations.notFound"));
        return;
      }
      
      // Check if this is a template (starts with "template-" or is marked as template)
      // Templates are inactive by default and need to be "activated" (created as real automation)
      const isTemplate = automation.is_template === true || id.startsWith("template-");
      
      if (isTemplate && !isActive) {
        // Create the automation from template using raw database data
        if (!automation._raw) {
          toast.error(t("web.provider.pages.marketing/automations.templateUnavailable"));
          return;
        }
        
        const raw = automation._raw as { name?: string; trigger_type?: string; trigger_config?: Record<string, unknown>; action_type?: string; action_config?: Record<string, unknown>; delay_minutes?: number; description?: string };
        await fetcher.post("/api/provider/automations", {
          name: raw.name,
          trigger_type: raw.trigger_type,
          trigger_config: raw.trigger_config || {},
          action_type: raw.action_type || "sms",
          action_config: raw.action_config || {},
          delay_minutes: raw.delay_minutes || 0,
          is_active: true,
          description: raw.description,
        });
        toast.success(t("web.provider.pages.marketing/automations.enabled"));
      } else {
        // Update existing automation
        await fetcher.patch(`/api/provider/automations/${id}`, {
          is_active: !isActive,
        });
        toast.success(!isActive ? t("web.provider.pages.marketing/automations.enabled") : t("web.provider.pages.marketing/automations.disabled"));
      }
      loadAutomations();
    } catch (error: unknown) {
      console.error("Failed to toggle automation:", error);
      toastPlanGateError(error, t("web.provider.pages.marketing/automations.failedToUpdate"));
    }
  };

  const loadExecutionHistory = async (automationId: string) => {
    try {
      setIsLoadingHistory(true);
      const response = await fetcher.get<{ data: any[] }>(`/api/provider/automations/${automationId}/executions`);
      setExecutionHistory(response?.data ?? []);
    } catch (error) {
      console.error("Failed to load execution history:", error);
      toast.error(t("web.provider.pages.marketing/automations.failedToLoadHistory"));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const filteredAutomations = automations.filter((auto) => {
    if (activeTab === "reminders") return auto.type === "reminder";
    if (activeTab === "updates") return auto.type === "update";
    if (activeTab === "bookings") return auto.type === "booking";
    if (activeTab === "milestones") return auto.type === "milestone";
    return true;
  });

  return (
    <div>
      <PageHeader
        title={t("web.provider.pages.marketing/automations.title")}
        subtitle={t("web.provider.pages.marketing/automations.subtitle")}
      />

      {/* Subscription Gate */}
      {subscriptionRequired && (
        <div className="mb-6">
          <SubscriptionGate
            feature={t("web.provider.pages.marketing/automations.feature")}
            message={getUpgradeMessage("marketing.automations")}
          />
        </div>
      )}

      {/* Don't show content if subscription is required */}
      {!subscriptionRequired && (
        <>
      {/* Quick Links Card */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard className="w-full md:w-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-600">{t("web.provider.pages.marketing/automations.smsRemaining")}</p>
              {isLoadingBalance ? (
                <p className="text-2xl font-semibold animate-pulse">...</p>
              ) : smsBalance !== null ? (
                <p className="text-2xl font-semibold">{smsBalance.toLocaleString()}</p>
              ) : (
                <p className="text-2xl font-semibold text-gray-400">{t("web.provider.pages.marketing/automations.na")}</p>
              )}
              <p className="text-xs text-gray-500 mt-1 max-w-[220px]">
                {t("web.provider.pages.marketing/automations.smsHint")}
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={loadSmsBalance}
              disabled={isLoadingBalance}
            >
              {isLoadingBalance ? t("web.provider.reports.hub.loading") : t("web.provider.pages.marketing/automations.viewBalance")}
            </Button>
          </div>
        </SectionCard>
        
        <SectionCard className="w-full md:w-auto bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium text-gray-700">{t("web.provider.pages.marketing/automations.expressLinks")}</p>
              </div>
              <p className="text-xs text-gray-600">{t("web.provider.pages.marketing/automations.expressLinksHint")}</p>
            </div>
            <NextLink href="/provider/express-booking">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                {t("web.provider.pages.marketing/automations.manageLinks")}
              </Button>
            </NextLink>
          </div>
        </SectionCard>

        <SectionCard className="w-full md:w-auto bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-medium text-gray-700">{t("web.provider.pages.marketing/automations.campaigns")}</p>
              </div>
              <p className="text-xs text-gray-600">{t("web.provider.pages.marketing/automations.campaignsHint")}</p>
            </div>
            <NextLink href="/provider/marketing/campaigns">
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                {t("web.provider.pages.marketing/automations.manageCampaigns")}
              </Button>
            </NextLink>
          </div>
        </SectionCard>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reminders">{t("web.provider.pages.marketing/automations.reminders")}</TabsTrigger>
          <TabsTrigger value="updates">{t("web.provider.pages.marketing/automations.updates")}</TabsTrigger>
          <TabsTrigger value="bookings">{t("web.provider.pages.marketing/automations.increaseBookings")}</TabsTrigger>
          <TabsTrigger value="milestones">{t("web.provider.pages.marketing/automations.milestones")}</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredAutomations.length === 0 ? (
            <SectionCard className="p-12 text-center">
              {/*
                §Provider-launch (audit 2026-04): the previous empty-state
                CTA was a toast-only stub ("Automation builder coming
                soon…") even though this page already creates real
                automations via the template-activation flow handled by
                toggleAutomation() + POST /api/provider/automations. Empty
                tabs here generally mean our server-side template
                seed didn't return any templates for that category, so
                we now expose two honest actions:
                  1. Reload automations so providers can recover from a
                     transient failure without reloading the whole app.
                  2. Jump to Marketing Campaigns for a real one-off send.
              */}
              <p className="text-gray-600 mb-2">{t("web.provider.pages.marketing/automations.noTabYet", { tab: activeTab })}</p>
              <p className="text-sm text-gray-500 mb-6">
                {t("web.provider.pages.marketing/automations.emptyHint")}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => loadAutomations()}
                  disabled={isLoading}
                >
                  {t("web.provider.pages.marketing/automations.reload")}
                </Button>
                <NextLink href="/provider/marketing/campaigns">
                  <Button className="bg-primary hover:bg-primary-hover">
                    {t("web.provider.pages.marketing/automations.createCampaign")}
                  </Button>
                </NextLink>
              </div>
            </SectionCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAutomations.map((automation) => (
                <SectionCard key={automation.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{automation.name}</h3>
                      <p className="text-sm text-gray-600 mb-3">{automation.description}</p>
                      <Badge variant="outline" className="text-xs">
                        {automation.trigger}
                      </Badge>
                    </div>
                    <Switch
                      checked={automation.is_active}
                      onCheckedChange={() => toggleAutomation(automation.id, automation.is_active)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedAutomation(automation);
                        setPreviewDialogOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4 me-2" />
                      {t("web.provider.pages.marketing/automations.editMessage")}
                    </Button>
                    {!automation.is_template && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          setSelectedAutomation(automation);
                          setHistoryDialogOpen(true);
                          await loadExecutionHistory(automation.id);
                        }}
                      >
                        <History className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
        </>
      )}

      {/* Message Preview/Edit Dialog */}
      {selectedAutomation && (
        <MessagePreviewDialog
          key={selectedAutomation.id}
          open={previewDialogOpen}
          onClose={() => {
            setPreviewDialogOpen(false);
            setSelectedAutomation(null);
          }}
          automation={{
            id: selectedAutomation.id,
            name: selectedAutomation.name,
            description: selectedAutomation.description || "",
            trigger: selectedAutomation.trigger,
            type: selectedAutomation.type,
            action_type: (selectedAutomation as any)._raw?.action_type || "sms",
            message_template: (selectedAutomation as any)._raw?.action_config?.message_template || "",
            subject: (selectedAutomation as any)._raw?.action_config?.subject || "",
          }}
          onSave={async (messageTemplate, subject) => {
            await fetcher.patch(`/api/provider/automations/${selectedAutomation.id}`, {
              action_config: {
                message_template: messageTemplate,
                ...(subject && { subject }),
              },
            });
            toast.success(t("web.provider.pages.marketing/automations.templateUpdated"));
            loadAutomations();
          }}
        />
      )}

      {/* Execution History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("web.provider.pages.marketing/automations.historyTitle", { name: selectedAutomation?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          {isLoadingHistory ? (
            <div className="py-8 text-center">{t("web.provider.pages.marketing/automations.loadingHistory")}</div>
          ) : executionHistory.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {t("web.provider.pages.marketing/automations.noExecutions")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("web.provider.common.date")}</TableHead>
                  <TableHead>{t("web.provider.common.customer")}</TableHead>
                  <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                  <TableHead>{t("web.provider.pages.marketing/automations.messageId")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executionHistory.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell>
                      {format(new Date(execution.executed_at), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      {execution.customer?.full_name || execution.customer?.email || t("web.provider.pages.marketing/automations.unknown")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={execution.message_id ? "default" : "secondary"}>
                        {execution.message_id ? t("web.provider.pages.marketing/automations.sent") : t("web.provider.pages.marketing/automations.pending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {execution.message_id || t("web.provider.pages.marketing/automations.na")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

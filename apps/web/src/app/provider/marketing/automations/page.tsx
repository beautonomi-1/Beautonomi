"use client";

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
import { Info, Link as LinkIcon, Edit, History, Settings } from "lucide-react";
import { toast } from "sonner";
import NextLink from "next/link";
import { MessagePreviewDialog } from "./components/MessagePreviewDialog";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function ProviderAutomations() {
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
            return `${triggerConfig.hours_before}h before`;
          }
          if (triggerConfig?.minutes_before) {
            const hours = Math.floor(triggerConfig.minutes_before / 60);
            const minutes = triggerConfig.minutes_before % 60;
            if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m before`;
            if (hours > 0) return `${hours}h before`;
            return `${minutes}m before`;
          }
          return triggerType || "";
        };
        
        return {
          id: auto.id,
          name: auto.name,
          type: mapType(auto.trigger_type),
          trigger: formatTrigger(auto.trigger_type, auto.trigger_config),
          is_active: isTemplate ? false : (auto.is_active ?? true),
          description: auto.description || "Automated message",
          is_template: isTemplate,
          // Store raw data for template activation
          _raw: auto,
        };
      });
      
      setAutomations(mappedAutomations);
      setSubscriptionRequired(false);
    } catch (error) {
      // Check if it's a subscription error first (before logging)
      if (error instanceof FetchError) {
        const isSubscriptionError = 
          error.code === "SUBSCRIPTION_REQUIRED" || 
          error.message?.toLowerCase().includes("subscription upgrade") ||
          error.message?.toLowerCase().includes("starter plan") ||
          error.message?.toLowerCase().includes("subscription") ||
          error.status === 403;
        
        if (isSubscriptionError) {
          // Handle subscription error gracefully - no console error, no toast
          setSubscriptionRequired(true);
          setIsLoading(false);
          return; // Exit early, don't show error toast
        }
        
        // For other FetchErrors, log and show toast
        console.error("Failed to load automations:", error);
        toast.error(error.message || "Failed to load automations");
      } else {
        // For non-FetchErrors, log and show toast
        console.error("Failed to load automations:", error);
        toast.error("Failed to load automations");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutomation = async (id: string, isActive: boolean) => {
    try {
      // Find the automation in the current list to check if it's a template
      const automation = automations.find((a) => a.id === id);
      
      if (!automation) {
        toast.error("Automation not found");
        return;
      }
      
      // Check if this is a template (starts with "template-" or is marked as template)
      // Templates are inactive by default and need to be "activated" (created as real automation)
      const isTemplate = automation.is_template === true || id.startsWith("template-");
      
      if (isTemplate && !isActive) {
        // Create the automation from template using raw database data
        if (!automation._raw) {
          toast.error("Template data not available");
          return;
        }
        
        const raw = automation._raw;
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
        toast.success("Automation enabled");
      } else {
        // Update existing automation
        await fetcher.patch(`/api/provider/automations/${id}`, {
          is_active: !isActive,
        });
        toast.success(`Automation ${!isActive ? "enabled" : "disabled"}`);
      }
      loadAutomations();
    } catch (error: any) {
      console.error("Failed to toggle automation:", error);
      toast.error(error?.message || "Failed to update automation");
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
        title="Automations"
        subtitle="Set up automated messages and reminders"
      />

      {/* Subscription Gate */}
      {subscriptionRequired && (
        <div className="mb-6">
          <SubscriptionGate
            feature="Marketing Automations"
            message="Marketing automations require a subscription upgrade"
            upgradeMessage="Upgrade to Starter plan or higher to access marketing automations and send automated messages to your clients."
            showUpgradeButton={true}
          />
        </div>
      )}

      {/* Don't show content if subscription is required */}
      {!subscriptionRequired && (
        <>
          {/* Top-up Card */}
      <SectionCard className="mb-6 bg-gradient-to-r from-[#FF0077]/10 to-[#D60565]/10 border-[#FF0077]/20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-5 h-5 text-[#FF0077]" />
              <h3 className="font-semibold">Ensure your text messages send with automatic top-ups</h3>
            </div>
            <p className="text-sm text-gray-600">
              Never miss a message. Set up automatic top-ups to keep your communications flowing.
            </p>
          </div>
          <Button 
            className="bg-[#FF0077] hover:bg-[#D60565] whitespace-nowrap"
            onClick={() => {
              // Navigate to Twilio integration settings
              window.location.href = "/provider/settings/integrations";
            }}
          >
            <Settings className="w-4 h-4 mr-2" />
            Set up
          </Button>
        </div>
      </SectionCard>

      {/* Quick Links Card */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard className="w-full md:w-auto">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-600">Text messages remaining</p>
              {isLoadingBalance ? (
                <p className="text-2xl font-semibold animate-pulse">...</p>
              ) : smsBalance !== null ? (
                <p className="text-2xl font-semibold">{smsBalance.toLocaleString()}</p>
              ) : (
                <p className="text-2xl font-semibold text-gray-400">N/A</p>
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={loadSmsBalance}
              disabled={isLoadingBalance}
            >
              {isLoadingBalance ? "Loading..." : "View Balance"}
            </Button>
          </div>
        </SectionCard>
        
        <SectionCard className="w-full md:w-auto bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium text-gray-700">Express Booking Links</p>
              </div>
              <p className="text-xs text-gray-600">Create quick booking links for clients</p>
            </div>
            <NextLink href="/provider/express-booking">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                Manage Links
              </Button>
            </NextLink>
          </div>
        </SectionCard>

        <SectionCard className="w-full md:w-auto bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-medium text-gray-700">Marketing Campaigns</p>
              </div>
              <p className="text-xs text-gray-600">Create email and SMS campaigns</p>
            </div>
            <NextLink href="/provider/marketing/campaigns">
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                Manage Campaigns
              </Button>
            </NextLink>
          </div>
        </SectionCard>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="updates">Appointment updates</TabsTrigger>
          <TabsTrigger value="bookings">Increase bookings</TabsTrigger>
          <TabsTrigger value="milestones">Celebrate milestones</TabsTrigger>
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
              <p className="text-gray-600 mb-4">No {activeTab} automations yet</p>
              <Button
                variant="outline"
                onClick={() => console.log("Create automation")}
              >
                Create Automation
              </Button>
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
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Message
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
            toast.success("Message template updated");
            loadAutomations();
          }}
        />
      )}

      {/* Execution History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Execution History: {selectedAutomation?.name}</DialogTitle>
          </DialogHeader>
          {isLoadingHistory ? (
            <div className="py-8 text-center">Loading history...</div>
          ) : executionHistory.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No executions yet. This automation hasn't been triggered.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Message ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executionHistory.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell>
                      {format(new Date(execution.executed_at), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      {execution.customer?.full_name || execution.customer?.email || "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={execution.message_id ? "default" : "secondary"}>
                        {execution.message_id ? "Sent" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {execution.message_id || "N/A"}
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

  const loadExecutionHistory = async (automationId: string) => {
    try {
      setIsLoadingHistory(true);
      const response = await fetcher.get<{ data: unknown[] }>(`/api/provider/automations/${automationId}/executions`);
      setExecutionHistory(response?.data ?? []);
    } catch (error) {
      console.error("Failed to load execution history:", error);
      toast.error("Failed to load execution history");
    } finally {
      setIsLoadingHistory(false);
    }
  };
}

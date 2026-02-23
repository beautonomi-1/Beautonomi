"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  MessageSquare,
  Bell,
  Send,
  History,
  Users,
  Building2,
  UserPlus,
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

const RECIPIENT_OPTIONS = [
  { value: "all_users", label: "All Customers", icon: Users },
  { value: "all_providers", label: "All Providers", icon: Building2 },
  { value: "custom", label: "Specific recipients", icon: UserPlus },
] as const;

function parseUserIds(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  return e.details ? `${e.message}: ${Array.isArray(e.details) ? (e.details as Array<{ message?: string }>).map((d) => d.message).join("; ") : String(e.details)}` : e.message;
}

interface BroadcastLog {
  id: string;
  sent_by: string;
  recipient_type: string;
  recipient_count: number;
  channel: string;
  subject?: string;
  message: string;
  status: string;
  notification_id?: string;
  created_at: string;
}

export default function BroadcastPage() {
  const [activeTab, setActiveTab] = useState<"email" | "sms" | "push" | "history">("email");
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<BroadcastLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Email form
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailRecipientType, setEmailRecipientType] = useState<string>("all_users");
  const [emailSpecificIds, setEmailSpecificIds] = useState("");

  // SMS form
  const [smsMessage, setSmsMessage] = useState("");
  const [smsRecipientType, setSmsRecipientType] = useState<string>("all_users");
  const [smsSpecificIds, setSmsSpecificIds] = useState("");

  // Push form
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushRecipientType, setPushRecipientType] = useState<string>("all_users");
  const [pushSpecificIds, setPushSpecificIds] = useState("");
  const [pushUrl, setPushUrl] = useState("");

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetcher.get<{
        data?: { broadcasts?: BroadcastLog[]; meta?: { total: number } };
        broadcasts?: BroadcastLog[];
      }>("/api/admin/broadcast/history");
      const raw = (response as any)?.data ?? response;
      const broadcasts = Array.isArray(raw?.broadcasts) ? raw.broadcasts : Array.isArray(raw) ? raw : [];
      setHistory(broadcasts);
    } catch (error) {
      console.error("Error loading history:", error);
      toast.error(formatFetchError(error, "Failed to load broadcast history"));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const getRecipientLabel = (type: string) => {
    if (type === "all_users") return "all customers";
    if (type === "all_providers") return "all providers";
    return "specific recipients";
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    if (emailRecipientType === "custom") {
      const ids = parseUserIds(emailSpecificIds);
      if (ids.length === 0) {
        toast.error("Enter at least one user ID for specific recipients");
        return;
      }
    }
    if (!confirm(`Send email to ${getRecipientLabel(emailRecipientType)}?`)) return;

    try {
      setIsSending(true);
      const payload: { subject: string; message: string; recipient_type: string; user_ids?: string[] } = {
        subject: emailSubject,
        message: emailMessage,
        recipient_type: emailRecipientType,
      };
      if (emailRecipientType === "custom") payload.user_ids = parseUserIds(emailSpecificIds);
      const response = await fetcher.post<{ success: boolean; recipients: number; notification_id: string }>(
        "/api/admin/broadcast/email",
        payload
      );
      const responseData = (response as any)?.data ?? response;
      toast.success(`Email sent to ${responseData?.recipients ?? 0} recipients`);
      setEmailSubject("");
      setEmailMessage("");
      if (emailRecipientType === "custom") setEmailSpecificIds("");
      if (activeTab === "history") loadHistory();
    } catch (error) {
      toast.error(formatFetchError(error, "Failed to send email broadcast"));
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!smsMessage.trim()) {
      toast.error("Message is required");
      return;
    }
    if (smsRecipientType === "custom") {
      const ids = parseUserIds(smsSpecificIds);
      if (ids.length === 0) {
        toast.error("Enter at least one user ID for specific recipients");
        return;
      }
    }
    if (!confirm(`Send SMS to ${getRecipientLabel(smsRecipientType)}?`)) return;

    try {
      setIsSending(true);
      const payload: { message: string; recipient_type: string; user_ids?: string[] } = {
        message: smsMessage,
        recipient_type: smsRecipientType,
      };
      if (smsRecipientType === "custom") payload.user_ids = parseUserIds(smsSpecificIds);
      const response = await fetcher.post<{ success: boolean; recipients: number; notification_id: string }>(
        "/api/admin/broadcast/sms",
        payload
      );
      const responseData = (response as any)?.data ?? response;
      toast.success(`SMS sent to ${responseData?.recipients ?? 0} recipients`);
      setSmsMessage("");
      if (smsRecipientType === "custom") setSmsSpecificIds("");
      if (activeTab === "history") loadHistory();
    } catch (error) {
      toast.error(formatFetchError(error, "Failed to send SMS broadcast"));
    } finally {
      setIsSending(false);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (pushRecipientType === "custom") {
      const ids = parseUserIds(pushSpecificIds);
      if (ids.length === 0) {
        toast.error("Enter at least one user ID for specific recipients");
        return;
      }
    }
    if (!confirm(`Send push notification to ${getRecipientLabel(pushRecipientType)}?`)) return;

    try {
      setIsSending(true);
      const payload: { title: string; message: string; recipient_type: string; url?: string; user_ids?: string[] } = {
        title: pushTitle,
        message: pushMessage,
        recipient_type: pushRecipientType,
        url: pushUrl || undefined,
      };
      if (pushRecipientType === "custom") payload.user_ids = parseUserIds(pushSpecificIds);
      const response = await fetcher.post<{ success: boolean; recipients: number; notification_id: string }>(
        "/api/admin/broadcast/push",
        payload
      );
      const responseData = (response as any)?.data ?? response;
      toast.success(`Push notification sent to ${responseData?.recipients ?? 0} recipients`);
      setPushTitle("");
      setPushMessage("");
      setPushUrl("");
      if (pushRecipientType === "custom") setPushSpecificIds("");
      if (activeTab === "history") loadHistory();
    } catch (error) {
      toast.error(formatFetchError(error, "Failed to send push broadcast"));
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-100 text-green-800">Sent</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return <Mail className="w-4 h-4" />;
      case "sms":
        return <MessageSquare className="w-4 h-4" />;
      case "push":
        return <Bell className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                Broadcast Messaging
              </h1>
              <p className="text-gray-600">
                Send messages to all users, providers, or custom segments
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="mb-6">
                <TabsTrigger value="email">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="sms">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  SMS
                </TabsTrigger>
                <TabsTrigger value="push">
                  <Bell className="w-4 h-4 mr-2" />
                  Push
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="w-4 h-4 mr-2" />
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email">
                <div className="bg-white border rounded-lg p-6 space-y-4">
                  <div>
                    <Label htmlFor="email_recipient">Recipients</Label>
                    <Select
                      value={emailRecipientType}
                      onValueChange={setEmailRecipientType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose recipients" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPIENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="w-4 h-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {emailRecipientType === "custom" && (
                    <div>
                      <Label htmlFor="email_specific_ids">User IDs (one per line or comma-separated)</Label>
                      <Textarea
                        id="email_specific_ids"
                        value={emailSpecificIds}
                        onChange={(e) => setEmailSpecificIds(e.target.value)}
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        rows={3}
                        className="font-mono text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="email_subject">Subject *</Label>
                    <Input
                      id="email_subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Email subject..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="email_message">Message *</Label>
                    <Textarea
                      id="email_message"
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      placeholder="Email message..."
                      rows={8}
                    />
                  </div>

                  <Button
                    onClick={handleSendEmail}
                    disabled={
                      isSending ||
                      !emailSubject.trim() ||
                      !emailMessage.trim() ||
                      (emailRecipientType === "custom" && parseUserIds(emailSpecificIds).length === 0)
                    }
                    className="w-full"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {isSending ? "Sending..." : "Send Email Broadcast"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="sms">
                <div className="bg-white border rounded-lg p-6 space-y-4">
                  <div>
                    <Label htmlFor="sms_recipient">Recipients</Label>
                    <Select
                      value={smsRecipientType}
                      onValueChange={setSmsRecipientType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose recipients" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPIENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="w-4 h-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {smsRecipientType === "custom" && (
                    <div>
                      <Label htmlFor="sms_specific_ids">User IDs (one per line or comma-separated)</Label>
                      <Textarea
                        id="sms_specific_ids"
                        value={smsSpecificIds}
                        onChange={(e) => setSmsSpecificIds(e.target.value)}
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        rows={3}
                        className="font-mono text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="sms_message">Message *</Label>
                    <Textarea
                      id="sms_message"
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      placeholder="SMS message (160 characters recommended)..."
                      rows={4}
                      maxLength={500}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      {smsMessage.length} / 500 characters
                    </p>
                  </div>

                  <Button
                    onClick={handleSendSMS}
                    disabled={
                      isSending ||
                      !smsMessage.trim() ||
                      (smsRecipientType === "custom" && parseUserIds(smsSpecificIds).length === 0)
                    }
                    className="w-full"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {isSending ? "Sending..." : "Send SMS Broadcast"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="push">
                <div className="bg-white border rounded-lg p-6 space-y-4">
                  <div>
                    <Label htmlFor="push_recipient">Recipients</Label>
                    <Select
                      value={pushRecipientType}
                      onValueChange={setPushRecipientType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose recipients" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPIENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <opt.icon className="w-4 h-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {pushRecipientType === "custom" && (
                    <div>
                      <Label htmlFor="push_specific_ids">User IDs (one per line or comma-separated)</Label>
                      <Textarea
                        id="push_specific_ids"
                        value={pushSpecificIds}
                        onChange={(e) => setPushSpecificIds(e.target.value)}
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        rows={3}
                        className="font-mono text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="push_title">Title *</Label>
                    <Input
                      id="push_title"
                      value={pushTitle}
                      onChange={(e) => setPushTitle(e.target.value)}
                      placeholder="Notification title..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="push_message">Message *</Label>
                    <Textarea
                      id="push_message"
                      value={pushMessage}
                      onChange={(e) => setPushMessage(e.target.value)}
                      placeholder="Notification message..."
                      rows={4}
                    />
                  </div>

                  <div>
                    <Label htmlFor="push_url">URL (optional)</Label>
                    <Input
                      id="push_url"
                      type="url"
                      value={pushUrl}
                      onChange={(e) => setPushUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <Button
                    onClick={handleSendPush}
                    disabled={
                      isSending ||
                      !pushTitle.trim() ||
                      !pushMessage.trim() ||
                      (pushRecipientType === "custom" && parseUserIds(pushSpecificIds).length === 0)
                    }
                    className="w-full"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {isSending ? "Sending..." : "Send Push Broadcast"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="history">
                {isLoadingHistory ? (
                  <LoadingTimeout loadingMessage="Loading broadcast history..." />
                ) : history.length === 0 ? (
                  <EmptyState
                    title="No broadcast history"
                    description="Broadcast messages you send will appear here"
                  />
                ) : (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Channel
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Recipients
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Subject/Title
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {history.map((broadcast) => (
                            <tr key={broadcast.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  {getChannelIcon(broadcast.channel)}
                                  <span className="capitalize">{broadcast.channel}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  {broadcast.recipient_type === "all_users" && <Users className="w-4 h-4 text-gray-400" />}
                                  {broadcast.recipient_type === "all_providers" && <Building2 className="w-4 h-4 text-gray-400" />}
                                  {broadcast.recipient_type === "custom" && <UserPlus className="w-4 h-4 text-gray-400" />}
                                  <span>
                                    {broadcast.recipient_type === "all_users"
                                      ? "All customers"
                                      : broadcast.recipient_type === "all_providers"
                                        ? "All providers"
                                        : "Specific"}
                                    {" · "}
                                    {broadcast.recipient_count}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="max-w-xs truncate">
                                  {broadcast.subject || broadcast.message}
                                </div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                {getStatusBadge(broadcast.status)}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                {format(new Date(broadcast.created_at), "PPp")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </RoleGuard>
  );
}

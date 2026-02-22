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
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
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
  const [emailRecipientType, setEmailRecipientType] = useState("all_users");

  // SMS form
  const [smsMessage, setSmsMessage] = useState("");
  const [smsRecipientType, setSmsRecipientType] = useState("all_users");

  // Push form
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushRecipientType, setPushRecipientType] = useState("all_users");
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
        broadcasts?: BroadcastLog[];
        data?: BroadcastLog[];
        meta: { total: number };
      }>("/api/admin/broadcast/history");
      // Handle both response formats for compatibility
      const broadcasts = (response as any).broadcasts || (response as any).data || [];
      setHistory(Array.isArray(broadcasts) ? broadcasts : []);
    } catch (error) {
      console.error("Error loading history:", error);
      toast.error("Failed to load broadcast history");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      toast.error("Subject and message are required");
      return;
    }

    if (!confirm(`Send email to ${emailRecipientType === "all_users" ? "all users" : emailRecipientType === "all_providers" ? "all providers" : "selected users"}?`)) {
      return;
    }

    try {
      setIsSending(true);
      const response = await fetcher.post<{
        success: boolean;
        recipients: number;
        notification_id: string;
      }>("/api/admin/broadcast/email", {
        subject: emailSubject,
        message: emailMessage,
        recipient_type: emailRecipientType,
      });

      // Handle response format - fetcher may unwrap or return nested data
      const responseData = (response as any).data || response;
      toast.success(`Email sent to ${responseData.recipients || 0} recipients`);
      setEmailSubject("");
      setEmailMessage("");
      if (activeTab === "history") {
        loadHistory();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send email broadcast");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!smsMessage.trim()) {
      toast.error("Message is required");
      return;
    }

    if (!confirm(`Send SMS to ${smsRecipientType === "all_users" ? "all users" : smsRecipientType === "all_providers" ? "all providers" : "selected users"}?`)) {
      return;
    }

    try {
      setIsSending(true);
      const response = await fetcher.post<{
        success: boolean;
        recipients: number;
        notification_id: string;
      }>("/api/admin/broadcast/sms", {
        message: smsMessage,
        recipient_type: smsRecipientType,
      });

      // Handle response format - fetcher may unwrap or return nested data
      const responseData = (response as any).data || response;
      toast.success(`SMS sent to ${responseData.recipients || 0} recipients`);
      setSmsMessage("");
      if (activeTab === "history") {
        loadHistory();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send SMS broadcast");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim()) {
      toast.error("Title and message are required");
      return;
    }

    if (!confirm(`Send push notification to ${pushRecipientType === "all_users" ? "all users" : pushRecipientType === "all_providers" ? "all providers" : "selected users"}?`)) {
      return;
    }

    try {
      setIsSending(true);
      const response = await fetcher.post<{
        success: boolean;
        recipients: number;
        notification_id: string;
      }>("/api/admin/broadcast/push", {
        title: pushTitle,
        message: pushMessage,
        recipient_type: pushRecipientType,
        url: pushUrl || undefined,
      });

      // Handle response format - fetcher may unwrap or return nested data
      const responseData = (response as any).data || response;
      toast.success(`Push notification sent to ${responseData.recipients || 0} recipients`);
      setPushTitle("");
      setPushMessage("");
      setPushUrl("");
      if (activeTab === "history") {
        loadHistory();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send push broadcast");
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
    <RoleGuard allowedRoles={["superadmin"]}>
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
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_users">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            All Users
                          </div>
                        </SelectItem>
                        <SelectItem value="all_providers">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            All Providers
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                    disabled={isSending || !emailSubject.trim() || !emailMessage.trim()}
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
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_users">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            All Users
                          </div>
                        </SelectItem>
                        <SelectItem value="all_providers">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            All Providers
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                    disabled={isSending || !smsMessage.trim()}
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
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_users">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            All Users
                          </div>
                        </SelectItem>
                        <SelectItem value="all_providers">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            All Providers
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                    disabled={isSending || !pushTitle.trim() || !pushMessage.trim()}
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
                                  {broadcast.recipient_type === "all_users" ? (
                                    <Users className="w-4 h-4 text-gray-400" />
                                  ) : (
                                    <Building2 className="w-4 h-4 text-gray-400" />
                                  )}
                                  <span>{broadcast.recipient_count}</span>
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

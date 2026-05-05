"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
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
  Megaphone,
  ClipboardList,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const RECIPIENT_OPTIONS = [
  { value: "all_users", label: "All Customers", icon: Users },
  { value: "all_providers", label: "All Providers", icon: Building2 },
  { value: "custom", label: "Specific recipients", icon: UserPlus },
] as const;

const APP_TYPE_OPTIONS = [
  { value: "customer", label: "Customer app" },
  { value: "provider", label: "Provider app" },
] as const;

function parseUserIds(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatFetchError(e: any, fallback: string): string {
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
  metadata?: Record<string, unknown> | null;
}

const ANNOUNCEMENT_TYPES = [
  { value: "general", label: "General" },
  { value: "promotion", label: "Promotion" },
  { value: "event", label: "Event" },
  { value: "news", label: "News" },
] as const;

function BroadcastMessagingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"email" | "sms" | "push" | "history">("email");
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<BroadcastLog[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyChannelFilter, setHistoryChannelFilter] = useState<"all" | "email" | "sms" | "push">("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBroadcast, setDetailBroadcast] = useState<BroadcastLog | null>(null);

  // Email form
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailRecipientType, setEmailRecipientType] = useState<string>("all_users");
  const [emailSpecificIds, setEmailSpecificIds] = useState("");
  const [emailCustomAppType, setEmailCustomAppType] = useState<"customer" | "provider">("customer");

  // SMS form
  const [smsMessage, setSmsMessage] = useState("");
  const [smsRecipientType, setSmsRecipientType] = useState<string>("all_users");
  const [smsSpecificIds, setSmsSpecificIds] = useState("");
  const [smsCustomAppType, setSmsCustomAppType] = useState<"customer" | "provider">("customer");

  // Push form
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushRecipientType, setPushRecipientType] = useState<string>("all_users");
  const [pushSpecificIds, setPushSpecificIds] = useState("");
  const [pushCustomAppType, setPushCustomAppType] = useState<"customer" | "provider">("customer");
  const [pushUrl, setPushUrl] = useState("");
  const [pushStep, setPushStep] = useState<1 | 2 | 3>(1);
  const [pushAnnouncementType, setPushAnnouncementType] = useState<string>("general");
  const [pushMediaUrl, setPushMediaUrl] = useState("");
  const [pushMediaType, setPushMediaType] = useState<"" | "image" | "video">("");
  const [pushCtaLabel, setPushCtaLabel] = useState("");
  const [pushCtaUrl, setPushCtaUrl] = useState("");
  const [pushExpiresAt, setPushExpiresAt] = useState("");

  const applyBroadcastToForms = useCallback((b: BroadcastLog) => {
    const meta = (b.metadata && typeof b.metadata === "object" ? b.metadata : {}) as Record<string, unknown>;
    if (b.channel === "push") {
      setPushTitle(b.subject ?? "");
      setPushMessage(b.message ?? "");
      setPushRecipientType(b.recipient_type);
      setPushAnnouncementType(String(meta.announcement_type ?? "general"));
      setPushMediaUrl(typeof meta.media_url === "string" ? meta.media_url : "");
      setPushMediaType(
        meta.media_type === "image" || meta.media_type === "video" ? (meta.media_type as "image" | "video") : "",
      );
      setPushCtaLabel(typeof meta.cta_label === "string" ? meta.cta_label : "");
      setPushCtaUrl(typeof meta.cta_url === "string" ? meta.cta_url : "");
      setPushExpiresAt(typeof meta.expires_at === "string" ? meta.expires_at.slice(0, 16) : "");
      const dl = typeof meta.deep_link === "string" ? meta.deep_link : "";
      setPushUrl(dl);
      setPushStep(2);
      setActiveTab("push");
    } else if (b.channel === "email") {
      setEmailSubject(b.subject ?? "");
      setEmailMessage(b.message ?? "");
      setEmailRecipientType(b.recipient_type);
      setActiveTab("email");
    } else if (b.channel === "sms") {
      setSmsMessage(b.message ?? "");
      setSmsRecipientType(b.recipient_type);
      setActiveTab("sms");
    }
  }, []);

  useEffect(() => {
    const fromId = searchParams.get("from")?.trim();
    if (!fromId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await fetcher.get<{ data?: { broadcast?: BroadcastLog }; broadcast?: BroadcastLog }>(
          `/api/admin/broadcast/${encodeURIComponent(fromId)}`,
          { staleTimeMs: 0 },
        );
        const payload = raw as Record<string, unknown>;
        const b =
          ((payload?.data as { broadcast?: BroadcastLog } | undefined)?.broadcast ??
            payload?.broadcast) as BroadcastLog | undefined;
        if (cancelled || !b?.id) {
          toast.error("Could not load broadcast to duplicate.");
        } else {
          applyBroadcastToForms(b);
          toast.message("Composer filled from broadcast — review recipients before sending.", {
            description:
              b.recipient_type === "custom"
                ? "Custom user IDs were not saved on the log — re-enter them if needed."
                : undefined,
          });
        }
      } catch (e) {
        if (!cancelled) toast.error(formatFetchError(e, "Failed to load broadcast"));
      } finally {
        if (!cancelled) router.replace("/admin/broadcast", { scroll: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, applyBroadcastToForms]);

  const loadHistory = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      const qs = new URLSearchParams();
      if (historyChannelFilter !== "all") qs.set("channel", historyChannelFilter);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const response = await fetcher.get<{
        data?: { broadcasts?: BroadcastLog[]; meta?: { total: number } };
        broadcasts?: BroadcastLog[];
      }>(`/api/admin/broadcast/history${suffix}`, { staleTimeMs: 0 });
      const raw = (response as any)?.data ?? response;
      const broadcasts = Array.isArray(raw?.broadcasts) ? raw.broadcasts : Array.isArray(raw) ? raw : [];
      setHistory(broadcasts);
    } catch (error) {
      console.error("Error loading history:", error);
      toast.error(formatFetchError(error, "Failed to load broadcast history"));
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historyChannelFilter]);

  useEffect(() => {
    if (activeTab !== "history") return;
    void loadHistory();
  }, [activeTab, loadHistory]);

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
      const payload: { subject: string; message: string; recipient_type: string; user_ids?: string[]; app_type?: "customer" | "provider" } = {
        subject: emailSubject,
        message: emailMessage,
        recipient_type: emailRecipientType,
      };
      if (emailRecipientType === "custom") {
        payload.user_ids = parseUserIds(emailSpecificIds);
        payload.app_type = emailCustomAppType;
      }
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
      const payload: { message: string; recipient_type: string; user_ids?: string[]; app_type?: "customer" | "provider" } = {
        message: smsMessage,
        recipient_type: smsRecipientType,
      };
      if (smsRecipientType === "custom") {
        payload.user_ids = parseUserIds(smsSpecificIds);
        payload.app_type = smsCustomAppType;
      }
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
    if (pushMediaUrl.trim() && !pushMediaType) {
      toast.error("Select media type (image or video) when adding media URL");
      return;
    }
    if ((!pushCtaLabel.trim() && pushCtaUrl.trim()) || (pushCtaLabel.trim() && !pushCtaUrl.trim())) {
      toast.error("CTA requires both label and URL, or leave both blank");
      return;
    }
    if (!confirm(`Send push announcement to ${getRecipientLabel(pushRecipientType)}?`)) return;

    try {
      setIsSending(true);
      const payload: Record<string, unknown> = {
        title: pushTitle,
        message: pushMessage,
        recipient_type: pushRecipientType,
        announcement_type: pushAnnouncementType,
        url: pushUrl.trim() || undefined,
      };
      if (pushMediaUrl.trim()) {
        payload.media_url = pushMediaUrl.trim();
        payload.media_type = pushMediaType;
      }
      if (pushCtaLabel.trim() && pushCtaUrl.trim()) {
        payload.cta_label = pushCtaLabel.trim();
        payload.cta_url = pushCtaUrl.trim();
      }
      if (pushExpiresAt.trim()) {
        const iso = Number.isFinite(Date.parse(pushExpiresAt.trim()))
          ? new Date(pushExpiresAt.trim()).toISOString()
          : "";
        if (iso) payload.expires_at = iso;
      }
      if (pushRecipientType === "custom") {
        payload.user_ids = parseUserIds(pushSpecificIds);
        payload.app_type = pushCustomAppType;
      }
      const response = await fetcher.post<{ success: boolean; recipients: number; notification_id: string }>(
        "/api/admin/broadcast/push",
        payload
      );
      const responseData = (response as any)?.data ?? response;
      toast.success(`Push announcement sent (${responseData?.recipients ?? 0} recipients)`);
      setPushTitle("");
      setPushMessage("");
      setPushUrl("");
      setPushStep(1);
      setPushAnnouncementType("general");
      setPushMediaUrl("");
      setPushMediaType("");
      setPushCtaLabel("");
      setPushCtaUrl("");
      setPushExpiresAt("");
      if (pushRecipientType === "custom") setPushSpecificIds("");
      if (activeTab === "history") void loadHistory();
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

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setActiveTab("email")}
                className="rounded-xl border bg-white hover:bg-gray-50 p-4 text-left transition-colors"
              >
                <Mail className="w-5 h-5 text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-900">Compose email</p>
                <p className="text-xs text-gray-500 mt-0.5">HTML mail to tenants</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sms")}
                className="rounded-xl border bg-white hover:bg-gray-50 p-4 text-left transition-colors"
              >
                <MessageSquare className="w-5 h-5 text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-900">Compose SMS</p>
                <p className="text-xs text-gray-500 mt-0.5">Short text broadcast</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("push");
                  setPushStep(1);
                }}
                className="rounded-xl border bg-white hover:bg-gray-50 p-4 text-left transition-colors"
              >
                <Megaphone className="w-5 h-5 text-indigo-600 mb-2" />
                <p className="text-sm font-semibold text-gray-900">Push announcement</p>
                <p className="text-xs text-gray-500 mt-0.5">Rich in-app + mobile</p>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className="rounded-xl border bg-white hover:bg-gray-50 p-4 text-left transition-colors"
              >
                <History className="w-5 h-5 text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-900">History</p>
                <p className="text-xs text-gray-500 mt-0.5">Sent broadcasts</p>
              </button>
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
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="email_app_type">Target app</Label>
                        <Select value={emailCustomAppType} onValueChange={(value) => setEmailCustomAppType(value as "customer" | "provider")}>
                          <SelectTrigger id="email_app_type">
                            <SelectValue placeholder="Choose target app" />
                          </SelectTrigger>
                          <SelectContent>
                            {APP_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="sms_app_type">Target app</Label>
                        <Select value={smsCustomAppType} onValueChange={(value) => setSmsCustomAppType(value as "customer" | "provider")}>
                          <SelectTrigger id="sms_app_type">
                            <SelectValue placeholder="Choose target app" />
                          </SelectTrigger>
                          <SelectContent>
                            {APP_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                <div className="bg-white border rounded-lg p-6 space-y-6">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary" className="gap-1">
                      <Megaphone className="w-3.5 h-3.5" />
                      Push announcement wizard
                    </Badge>
                    {[1, 2, 3].map((s) => (
                      <span
                        key={s}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          pushStep === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {s}. {s === 1 ? "Audience" : s === 2 ? "Content" : "Review"}
                      </span>
                    ))}
                  </div>

                  {pushStep === 1 && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="push_recipient">Recipients</Label>
                        <Select value={pushRecipientType} onValueChange={setPushRecipientType}>
                          <SelectTrigger id="push_recipient">
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
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="push_app_type">Target app</Label>
                            <Select
                              value={pushCustomAppType}
                              onValueChange={(value) => setPushCustomAppType(value as "customer" | "provider")}
                            >
                              <SelectTrigger id="push_app_type">
                                <SelectValue placeholder="Choose target app" />
                              </SelectTrigger>
                              <SelectContent>
                                {APP_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
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
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (pushRecipientType === "custom" && parseUserIds(pushSpecificIds).length === 0) {
                              toast.error("Enter at least one user ID for specific recipients");
                              return;
                            }
                            setPushStep(2);
                          }}
                        >
                          Next: content
                        </Button>
                      </div>
                    </div>
                  )}

                  {pushStep === 2 && (
                    <div className="space-y-4">
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
                          placeholder="Notification message…"
                          rows={4}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Announcement type</Label>
                          <Select value={pushAnnouncementType} onValueChange={setPushAnnouncementType}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ANNOUNCEMENT_TYPES.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="push_expires">Expires at (UTC, optional)</Label>
                          <Input
                            id="push_expires"
                            type="datetime-local"
                            value={pushExpiresAt}
                            onChange={(e) => setPushExpiresAt(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="push_media_url">Media URL (optional)</Label>
                          <Input
                            id="push_media_url"
                            type="url"
                            value={pushMediaUrl}
                            onChange={(e) => setPushMediaUrl(e.target.value)}
                            placeholder="https://…"
                          />
                        </div>
                        <div>
                          <Label>Media type</Label>
                          <Select
                            value={pushMediaType || "none"}
                            onValueChange={(v) =>
                              setPushMediaType(v === "none" ? "" : (v as "image" | "video"))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pick when using media URL" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              <SelectItem value="image">Image (also used for rich push artwork)</SelectItem>
                              <SelectItem value="video">Video (in-app playback)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="push_cta_label">CTA label (optional)</Label>
                          <Input
                            id="push_cta_label"
                            value={pushCtaLabel}
                            onChange={(e) => setPushCtaLabel(e.target.value)}
                            placeholder="e.g. Shop the sale"
                          />
                        </div>
                        <div>
                          <Label htmlFor="push_cta_url">CTA URL (optional)</Label>
                          <Input
                            id="push_cta_url"
                            type="url"
                            value={pushCtaUrl}
                            onChange={(e) => setPushCtaUrl(e.target.value)}
                            placeholder="https://…"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="push_url">Deep link override (optional)</Label>
                        <Input
                          id="push_url"
                          value={pushUrl}
                          onChange={(e) => setPushUrl(e.target.value)}
                          placeholder="Defaults to mobile announcements hub: /(app)/announcements"
                        />
                      </div>

                      <div className="flex flex-wrap justify-between gap-2">
                        <Button type="button" variant="outline" onClick={() => setPushStep(1)}>
                          Back
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            if (!pushTitle.trim() || !pushMessage.trim()) {
                              toast.error("Title and message are required");
                              return;
                            }
                            setPushStep(3);
                          }}
                        >
                          Next: review
                        </Button>
                      </div>
                    </div>
                  )}

                  {pushStep === 3 && (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <ClipboardList className="w-4 h-4" /> Ready to send
                          </CardTitle>
                          <CardDescription>Verify audience and announcement payload before broadcasting.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-gray-700">
                          <p>
                            <span className="font-semibold">Audience:</span> {getRecipientLabel(pushRecipientType)}
                            {pushRecipientType === "custom" ? ` · ${parseUserIds(pushSpecificIds).length} IDs` : ""}
                          </p>
                          <p className="font-semibold">{pushTitle.trim() || "(Title)"}</p>
                          <p className="whitespace-pre-wrap text-gray-600">{pushMessage.trim() || "…"}</p>
                          <p>
                            <span className="font-semibold">Type:</span> {pushAnnouncementType}
                          </p>
                          {pushMediaUrl.trim() ? (
                            <p>
                              <span className="font-semibold">Media:</span> {pushMediaType} — {pushMediaUrl.trim()}
                            </p>
                          ) : null}
                          {pushCtaLabel.trim() && pushCtaUrl.trim() ? (
                            <p>
                              <span className="font-semibold">CTA:</span> {pushCtaLabel} → {pushCtaUrl}
                            </p>
                          ) : null}
                          {pushExpiresAt.trim() ? (
                            <p>
                              <span className="font-semibold">Expires:</span> {pushExpiresAt}
                            </p>
                          ) : null}
                          <p>
                            <span className="font-semibold">Deep link:</span>{" "}
                            {pushUrl.trim() || "/(app)/announcements"}
                          </p>
                        </CardContent>
                      </Card>
                      <div className="flex flex-wrap justify-between gap-2">
                        <Button type="button" variant="outline" onClick={() => setPushStep(2)}>
                          Back to content
                        </Button>
                        <Button
                          onClick={() => void handleSendPush()}
                          disabled={
                            isSending ||
                            !pushTitle.trim() ||
                            !pushMessage.trim() ||
                            (pushRecipientType === "custom" && parseUserIds(pushSpecificIds).length === 0)
                          }
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          {isSending ? "Sending…" : "Send push announcement"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <Label className="sr-only" htmlFor="history_channel">
                    Filter by channel
                  </Label>
                  <Select
                    value={historyChannelFilter}
                    onValueChange={(v) => setHistoryChannelFilter(v as typeof historyChannelFilter)}
                  >
                    <SelectTrigger id="history_channel" className="w-full sm:w-[220px] bg-white">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All channels</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="push">Push</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()}>
                    Refresh
                  </Button>
                </div>
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
                              Type
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {history.map((broadcast) => {
                            const annType =
                              broadcast.channel === "push" &&
                              broadcast.metadata &&
                              typeof broadcast.metadata === "object"
                                ? String(
                                    (broadcast.metadata as Record<string, unknown>).announcement_type ?? "general",
                                  )
                                : "—";
                            return (
                              <tr key={broadcast.id} className="hover:bg-gray-50">
                                <td
                                  className="px-4 py-4 whitespace-nowrap cursor-pointer"
                                  onClick={() => {
                                    setDetailBroadcast(broadcast);
                                    setDetailOpen(true);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    {getChannelIcon(broadcast.channel)}
                                    <span className="capitalize">{broadcast.channel}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm capitalize text-gray-700">
                                  {annType === "—" ? "—" : annType.replace(/-/g, " ")}
                                </td>
                                <td
                                  className="px-4 py-4 whitespace-nowrap cursor-pointer"
                                  onClick={() => {
                                    setDetailBroadcast(broadcast);
                                    setDetailOpen(true);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    {broadcast.recipient_type === "all_users" && (
                                      <Users className="w-4 h-4 text-gray-400" />
                                    )}
                                    {broadcast.recipient_type === "all_providers" && (
                                      <Building2 className="w-4 h-4 text-gray-400" />
                                    )}
                                    {broadcast.recipient_type === "custom" && (
                                      <UserPlus className="w-4 h-4 text-gray-400" />
                                    )}
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
                                <td
                                  className="px-4 py-4 cursor-pointer"
                                  onClick={() => {
                                    setDetailBroadcast(broadcast);
                                    setDetailOpen(true);
                                  }}
                                >
                                  <div className="max-w-xs truncate">{broadcast.subject || broadcast.message}</div>
                                </td>
                                <td
                                  className="px-4 py-4 whitespace-nowrap cursor-pointer"
                                  onClick={() => {
                                    setDetailBroadcast(broadcast);
                                    setDetailOpen(true);
                                  }}
                                >
                                  {getStatusBadge(broadcast.status)}
                                </td>
                                <td
                                  className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer"
                                  onClick={() => {
                                    setDetailBroadcast(broadcast);
                                    setDetailOpen(true);
                                  }}
                                >
                                  {format(new Date(broadcast.created_at), "PPp")}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-indigo-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/admin/broadcast?from=${encodeURIComponent(broadcast.id)}`);
                                    }}
                                  >
                                    Duplicate
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Broadcast detail</DialogTitle>
            <DialogDescription>
              {detailBroadcast?.channel ?? ""} · {detailBroadcast?.status ?? ""}
            </DialogDescription>
          </DialogHeader>
          {detailBroadcast ? (
            <div className="space-y-3 text-sm text-gray-800">
              <p>
                <span className="font-semibold text-gray-900">Recipients:</span> {detailBroadcast.recipient_type}{" "}
                ({detailBroadcast.recipient_count})
              </p>
              {detailBroadcast.subject ? (
                <p>
                  <span className="font-semibold text-gray-900">Subject / title:</span> {detailBroadcast.subject}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-gray-900">Message:</span> {detailBroadcast.message}
              </p>
              {detailBroadcast.metadata && typeof detailBroadcast.metadata === "object" ? (
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Metadata</p>
                  <pre className="text-xs bg-gray-50 border rounded-md p-3 overflow-x-auto">
                    {JSON.stringify(detailBroadcast.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            {detailBroadcast?.id ? (
              <Button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  router.push(`/admin/broadcast?from=${encodeURIComponent(detailBroadcast.id)}`);
                }}
              >
                Duplicate to composer
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RoleGuard>
  );
}

export default function BroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50/50 text-gray-600 text-sm">
          Loading broadcast…
        </div>
      }
    >
      <BroadcastMessagingPageInner />
    </Suspense>
  );
}

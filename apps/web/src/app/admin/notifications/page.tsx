"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bell,
  Send,
  FileText,
  Search,
  Plus,
  Edit,
  Trash2,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NotificationTemplate {
  id: string;
  key: string;
  title: string;
  body: string;
  channels: string[];
  email_subject?: string | null;
  email_body?: string | null;
  sms_body?: string | null;
  live_activities_config?: Record<string, any> | null;
  variables: string[];
  url: string | null;
  image?: string | null;
  onesignal_template_id?: string | null;
  enabled: boolean;
  description?: string | null;
}

interface NotificationLog {
  id: string;
  event_type: string;
  recipients: string;
  payload: {
    title: string;
    message: string;
  };
  status: "sent" | "failed";
  provider_response: any;
  created_at: string;
}

export default function AdminNotifications() {
  const [activeTab, setActiveTab] = useState<"send" | "templates" | "logs">("send");
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps -- load when tab changes

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (activeTab === "templates") {
        const response = await fetcher.get<{ data: NotificationTemplate[]; error: null }>(
          "/api/admin/notifications/templates"
        );
        setTemplates(response.data || []);
      } else if (activeTab === "logs") {
        const response = await fetcher.get<{
          data: NotificationLog[];
          error: null;
          meta: any;
        }>("/api/admin/notifications/logs");
        setLogs(response.data || []);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load data";
      setError(errorMessage);
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await fetcher.delete(`/api/admin/notifications/templates/${id}`);
      toast.success("Template deleted");
      loadData();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  if (isLoading && activeTab !== "send") {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading notifications..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-1 sm:mb-2">Notifications</h1>
          <p className="text-sm sm:text-base text-gray-600">Send notifications and manage templates</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="send">
              <Send className="w-4 h-4 mr-2" />
              Send Notification
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="w-4 h-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Bell className="w-4 h-4 mr-2" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send">
            <SendNotificationTab onSend={() => loadData()} />
          </TabsContent>

          <TabsContent value="templates">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Notification Templates</h2>
              <Button onClick={() => setShowTemplateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Template
              </Button>
            </div>
            {error ? (
              <EmptyState
                title="Failed to load templates"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : templates.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description="Create your first notification template"
                action={{
                  label: "Add Template",
                  onClick: () => setShowTemplateDialog(true),
                }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={() => {
                      setEditingTemplate(template);
                      setShowTemplateDialog(true);
                    }}
                    onDelete={() => handleDeleteTemplate(template.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4">Notification Logs</h2>
            </div>
            {error ? (
              <EmptyState
                title="Failed to load logs"
                description={error}
                action={{ label: "Retry", onClick: loadData }}
              />
            ) : logs.length === 0 ? (
              <EmptyState title="No notification logs" description="No notifications sent yet" />
            ) : (
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Recipients
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                            {log.event_type}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {log.payload.title}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {log.recipients.length > 50
                              ? `${log.recipients.slice(0, 50)}...`
                              : log.recipients}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              className={
                                log.status === "sent"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }
                            >
                              {log.status}
                            </Badge>
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

        {/* Template Dialog */}
        {showTemplateDialog && (
          <TemplateDialog
            template={editingTemplate}
            onClose={() => {
              setShowTemplateDialog(false);
              setEditingTemplate(null);
            }}
            onSave={() => {
              setShowTemplateDialog(false);
              setEditingTemplate(null);
              loadData();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function SendNotificationTab({ onSend }: { onSend: () => void }) {
  const [type, setType] = useState<"user" | "users" | "segment" | "template" | "broadcast" | "scheduled">("user");
  const [userId, setUserId] = useState("");
  const [userSearch, setUserSearch] = useState(""); // Email or phone for search
  const [userSearchResult, setUserSearchResult] = useState<{ id: string; email: string; phone: string | null; full_name: string | null } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [userIds, setUserIds] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [channels, setChannels] = useState<string[]>(["push"]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<"all" | "customers" | "providers">("all");
  const [segmentFilters, setSegmentFilters] = useState({
    role: "",
    city: "",
    country: "",
    verified: "",
  });
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const handleSearchUser = async () => {
    if (!userSearch.trim()) {
      toast.error("Please enter an email or phone number");
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetcher.get<{ data: { id: string; email: string; phone: string | null; full_name: string | null } }>(
        `/api/admin/users/search?q=${encodeURIComponent(userSearch.trim())}`
      );
      setUserSearchResult(response.data);
      setUserId(response.data.id);
      toast.success("User found!");
    } catch {
      setUserSearchResult(null);
      setUserId("");
      toast.error("User not found. Please check the email or phone number.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSending(true);

      const payload: any = { type };

      payload.channels = channels;

      if (type === "user") {
        if (!userId) {
          toast.error("Please search for a user first");
          return;
        }
        payload.user_id = userId;
        payload.title = title;
        payload.message = message;
      } else if (type === "users") {
        payload.user_ids = userIds.split(",").map((id) => id.trim()).filter(Boolean);
        payload.title = title;
        payload.message = message;
      } else if (type === "broadcast") {
        payload.type = "broadcast";
        payload.broadcast_target = broadcastTarget;
        payload.title = title;
        payload.message = message;
      } else if (type === "segment") {
        payload.type = "segment";
        payload.segment = segmentFilters;
        payload.title = title;
        payload.message = message;
      } else if (type === "template") {
        payload.template_key = templateKey;
        payload.user_ids = userIds.split(",").map((id) => id.trim()).filter(Boolean);
      } else if (type === "scheduled") {
        if (!scheduledDate || !scheduledTime) {
          toast.error("Please select a date and time for scheduling");
          return;
        }
        payload.type = "scheduled";
        payload.scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        payload.user_ids = userIds.split(",").map((id) => id.trim()).filter(Boolean);
        payload.title = title;
        payload.message = message;
      }

      // Channel-specific content
      if (channels.includes("email")) {
        if (emailSubject) payload.email_subject = emailSubject;
        if (emailBody) payload.email_body = emailBody;
      }
      if (channels.includes("sms")) {
        if (smsBody) payload.sms_body = smsBody;
      }

      if (url) payload.url = url;
      if (image) payload.image = image;

      await fetcher.post("/api/admin/notifications/send", payload);
      toast.success(`Notification sent via ${channels.join(", ")}`);
      onSend();
      // Reset form
      setUserId("");
      setUserSearch("");
      setUserSearchResult(null);
      setUserIds("");
      setTitle("");
      setMessage("");
      setEmailSubject("");
      setEmailBody("");
      setSmsBody("");
      setUrl("");
      setImage("");
      setChannels(["push"]);
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to send notification");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 shadow-sm">
      <h2 className="text-lg sm:text-xl font-semibold mb-4">Send Notification</h2>
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-800">
          <strong>Available Channels:</strong> Push Notifications (📱), Email (📧), SMS (💬), and Live Activities (🔴 iOS only).
          <br />
          <span className="text-xs text-blue-600 mt-1 block">Note: WhatsApp is not currently supported. Use SMS for text messaging.</span>
        </p>
      </div>
      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <Label htmlFor="type">Notification Type *</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Single User</SelectItem>
              <SelectItem value="users">Multiple Users</SelectItem>
              <SelectItem value="broadcast">Broadcast (All Users)</SelectItem>
              <SelectItem value="segment">Segmented (Filtered)</SelectItem>
              <SelectItem value="template">Template</SelectItem>
              <SelectItem value="scheduled">Scheduled Message</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "user" && (
          <>
            <div>
              <Label htmlFor="user_search">Search User by Email or Phone *</Label>
              <div className="flex gap-2">
                <Input
                  id="user_search"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserSearchResult(null);
                    setUserId("");
                  }}
                  placeholder="Enter email or phone number"
                  type="text"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleSearchUser}
                  disabled={isSearching || !userSearch.trim()}
                  variant="outline"
                >
                  {isSearching ? "Searching..." : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {userSearchResult && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm font-medium text-green-800">User Found:</p>
                  <p className="text-sm text-green-700">
                    {userSearchResult.full_name || "No name"} ({userSearchResult.email})
                    {userSearchResult.phone && ` - ${userSearchResult.phone}`}
                  </p>
                  <p className="text-xs text-green-600 mt-1">ID: {userSearchResult.id}</p>
                </div>
              )}
              {userId && (
                <input type="hidden" value={userId} />
              )}
            </div>
            <div>
              <Label htmlFor="channels">Notification Channels *</Label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "push", label: "Push Notification", icon: "📱", desc: "Browser/Mobile push notifications" },
                    { value: "email", label: "Email", icon: "📧", desc: "Email notification via OneSignal" },
                    { value: "sms", label: "SMS", icon: "💬", desc: "Text message (SMS) - not WhatsApp" },
                    { value: "live_activities", label: "Live Activities", icon: "🔴", desc: "iOS Live Activities only" },
                  ].map((channel) => (
                    <label key={channel.value} className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-full sm:w-auto">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChannels([...channels, channel.value]);
                          } else {
                            setChannels(channels.filter((c) => c !== channel.value));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{channel.icon}</span>
                          <span className="font-medium text-sm sm:text-base capitalize">{channel.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {channels.length === 0 && (
                  <p className="text-sm text-red-600">Please select at least one channel</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="message">Message *</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-2 border rounded-md min-h-[100px]"
                required
              />
            </div>
            {channels.includes("email") && (
              <>
                <div>
                  <Label htmlFor="email_subject">Email Subject</Label>
                  <Input
                    id="email_subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Leave empty to use title"
                  />
                </div>
                <div>
                  <Label htmlFor="email_body">Email Body (HTML supported)</Label>
                  <textarea
                    id="email_body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full p-2 border rounded-md min-h-[100px]"
                    placeholder="Leave empty to use message"
                  />
                </div>
              </>
            )}
            {channels.includes("sms") && (
              <div>
                <Label htmlFor="sms_body">SMS Body</Label>
                <textarea
                  id="sms_body"
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  className="w-full p-2 border rounded-md min-h-[80px]"
                  placeholder="Leave empty to use message (160 chars for single SMS)"
                  maxLength={1600}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {(smsBody || message).length} characters
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="url">Deep Link URL (optional)</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="image">Image URL (optional)</Label>
              <Input
                id="image"
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </>
        )}

        {type === "users" && (
          <>
            <div>
              <Label htmlFor="user_ids">User IDs (comma-separated) *</Label>
              <Input
                id="user_ids"
                value={userIds}
                onChange={(e) => setUserIds(e.target.value)}
                placeholder="uuid1, uuid2, uuid3"
                required
              />
            </div>
            <div>
              <Label htmlFor="channels">Notification Channels *</Label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "push", label: "Push Notification", icon: "📱", desc: "Browser/Mobile push notifications" },
                    { value: "email", label: "Email", icon: "📧", desc: "Email notification via OneSignal" },
                    { value: "sms", label: "SMS", icon: "💬", desc: "Text message (SMS) - not WhatsApp" },
                    { value: "live_activities", label: "Live Activities", icon: "🔴", desc: "iOS Live Activities only" },
                  ].map((channel) => (
                    <label key={channel.value} className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-full sm:w-auto">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChannels([...channels, channel.value]);
                          } else {
                            setChannels(channels.filter((c) => c !== channel.value));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{channel.icon}</span>
                          <span className="font-medium text-sm sm:text-base capitalize">{channel.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {channels.length === 0 && (
                  <p className="text-sm text-red-600">Please select at least one channel</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="message">Message *</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-2 border rounded-md min-h-[100px]"
                required
              />
            </div>
            {channels.includes("email") && (
              <>
                <div>
                  <Label htmlFor="email_subject">Email Subject</Label>
                  <Input
                    id="email_subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Leave empty to use title"
                  />
                </div>
                <div>
                  <Label htmlFor="email_body">Email Body</Label>
                  <textarea
                    id="email_body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full p-2 border rounded-md min-h-[100px]"
                    placeholder="Leave empty to use message (supports HTML)"
                  />
                </div>
              </>
            )}
            {channels.includes("sms") && (
              <div>
                <Label htmlFor="sms_body">SMS Body</Label>
                <textarea
                  id="sms_body"
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  className="w-full p-2 border rounded-md min-h-[80px]"
                  placeholder="Leave empty to use message (160 chars for single SMS)"
                  maxLength={1600}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {smsBody.length || message.length} characters
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="url">Deep Link URL (optional)</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="image">Image URL (optional)</Label>
              <Input
                id="image"
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </>
        )}

        {type === "broadcast" && (
          <>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium mb-2">⚠️ Broadcast Warning</p>
              <p className="text-sm text-yellow-700">
                This will send a notification to all users matching the selected target. This action cannot be undone.
              </p>
            </div>
            <div>
              <Label htmlFor="broadcast_target">Broadcast Target *</Label>
              <Select value={broadcastTarget} onValueChange={(v) => setBroadcastTarget(v as any)}>
                <SelectTrigger id="broadcast_target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users (Customers + Providers)</SelectItem>
                  <SelectItem value="customers">All Customers Only</SelectItem>
                  <SelectItem value="providers">All Providers Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="channels">Notification Channels *</Label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "push", label: "Push Notification", icon: "📱", desc: "Browser/Mobile push notifications" },
                    { value: "email", label: "Email", icon: "📧", desc: "Email notification via OneSignal" },
                    { value: "sms", label: "SMS", icon: "💬", desc: "Text message (SMS) - not WhatsApp" },
                  ].map((channel) => (
                    <label key={channel.value} className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-full sm:w-auto">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChannels([...channels, channel.value]);
                          } else {
                            setChannels(channels.filter((c) => c !== channel.value));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{channel.icon}</span>
                          <span className="font-medium text-sm sm:text-base capitalize">{channel.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="message">Message *</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-2 border rounded-md min-h-[100px]"
                required
              />
            </div>
            {channels.includes("email") && (
              <>
                <div>
                  <Label htmlFor="email_subject">Email Subject</Label>
                  <Input
                    id="email_subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Leave empty to use title"
                  />
                </div>
                <div>
                  <Label htmlFor="email_body">Email Body</Label>
                  <textarea
                    id="email_body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full p-2 border rounded-md min-h-[100px]"
                    placeholder="Leave empty to use message (supports HTML)"
                  />
                </div>
              </>
            )}
            {channels.includes("sms") && (
              <div>
                <Label htmlFor="sms_body">SMS Body</Label>
                <textarea
                  id="sms_body"
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  className="w-full p-2 border rounded-md min-h-[80px]"
                  placeholder="Leave empty to use message (160 chars for single SMS)"
                  maxLength={1600}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {smsBody.length || message.length} characters
                </p>
              </div>
            )}
          </>
        )}

        {type === "segment" && (
          <>
            <div>
              <Label>Segment Filters</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label htmlFor="segment_role" className="text-sm">Role</Label>
                  <Select
                    value={segmentFilters.role}
                    onValueChange={(v) => setSegmentFilters({ ...segmentFilters, role: v })}
                  >
                    <SelectTrigger id="segment_role">
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Roles</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="provider_owner">Provider Owner</SelectItem>
                      <SelectItem value="provider_staff">Provider Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="segment_verified" className="text-sm">Verification Status</Label>
                  <Select
                    value={segmentFilters.verified}
                    onValueChange={(v) => setSegmentFilters({ ...segmentFilters, verified: v })}
                  >
                    <SelectTrigger id="segment_verified">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="verified">Verified Only</SelectItem>
                      <SelectItem value="unverified">Unverified Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="segment_city" className="text-sm">City</Label>
                  <Input
                    id="segment_city"
                    value={segmentFilters.city}
                    onChange={(e) => setSegmentFilters({ ...segmentFilters, city: e.target.value })}
                    placeholder="Filter by city"
                  />
                </div>
                <div>
                  <Label htmlFor="segment_country" className="text-sm">Country</Label>
                  <Input
                    id="segment_country"
                    value={segmentFilters.country}
                    onChange={(e) => setSegmentFilters({ ...segmentFilters, country: e.target.value })}
                    placeholder="Filter by country"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="channels">Notification Channels *</Label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "push", label: "Push Notification", icon: "📱", desc: "Browser/Mobile push notifications" },
                    { value: "email", label: "Email", icon: "📧", desc: "Email notification via OneSignal" },
                    { value: "sms", label: "SMS", icon: "💬", desc: "Text message (SMS) - not WhatsApp" },
                  ].map((channel) => (
                    <label key={channel.value} className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-full sm:w-auto">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChannels([...channels, channel.value]);
                          } else {
                            setChannels(channels.filter((c) => c !== channel.value));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{channel.icon}</span>
                          <span className="font-medium text-sm sm:text-base capitalize">{channel.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="message">Message *</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-2 border rounded-md min-h-[100px]"
                required
              />
            </div>
          </>
        )}

        {type === "template" && (
          <>
            <div>
              <Label htmlFor="template_key">Template Key *</Label>
              <Input
                id="template_key"
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="user_ids">User IDs (comma-separated) *</Label>
              <Input
                id="user_ids"
                value={userIds}
                onChange={(e) => setUserIds(e.target.value)}
                placeholder="uuid1, uuid2, uuid3"
                required
              />
            </div>
            <div>
              <Label htmlFor="channels">Channels (optional - uses template channels if not specified)</Label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "push", label: "Push Notification", icon: "📱", desc: "Browser/Mobile push notifications" },
                    { value: "email", label: "Email", icon: "📧", desc: "Email notification via OneSignal" },
                    { value: "sms", label: "SMS", icon: "💬", desc: "Text message (SMS) - not WhatsApp" },
                    { value: "live_activities", label: "Live Activities", icon: "🔴", desc: "iOS Live Activities only" },
                  ].map((channel) => (
                    <label key={channel.value} className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-full sm:w-auto">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChannels([...channels, channel.value]);
                          } else {
                            setChannels(channels.filter((c) => c !== channel.value));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{channel.icon}</span>
                          <span className="font-medium text-sm sm:text-base capitalize">{channel.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {type === "scheduled" && (
          <>
            <div>
              <Label htmlFor="user_ids">User IDs (comma-separated) *</Label>
              <Input
                id="user_ids"
                value={userIds}
                onChange={(e) => setUserIds(e.target.value)}
                placeholder="uuid1, uuid2, uuid3"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheduled_date">Schedule Date *</Label>
                <Input
                  id="scheduled_date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </div>
              <div>
                <Label htmlFor="scheduled_time">Schedule Time *</Label>
                <Input
                  id="scheduled_time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="channels">Notification Channels *</Label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-4">
                  {[
                    { value: "push", label: "Push Notification", icon: "📱", desc: "Browser/Mobile push notifications" },
                    { value: "email", label: "Email", icon: "📧", desc: "Email notification via OneSignal" },
                    { value: "sms", label: "SMS", icon: "💬", desc: "Text message (SMS) - not WhatsApp" },
                  ].map((channel) => (
                    <label key={channel.value} className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors w-full sm:w-auto">
                      <input
                        type="checkbox"
                        checked={channels.includes(channel.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setChannels([...channels, channel.value]);
                          } else {
                            setChannels(channels.filter((c) => c !== channel.value));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">{channel.icon}</span>
                          <span className="font-medium text-sm sm:text-base capitalize">{channel.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="message">Message *</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full p-2 border rounded-md min-h-[100px]"
                required
              />
            </div>
          </>
        )}

        {(type !== "broadcast" && type !== "segment" && type !== "scheduled") && (
          <div>
            <Label htmlFor="url">URL (optional)</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        <Button type="submit" disabled={isSending} className="bg-[#FF0077] hover:bg-[#D60565]">
          {isSending
            ? "Sending..."
            : type === "scheduled"
            ? "Schedule Notification"
            : type === "broadcast"
            ? "Send Broadcast"
            : "Send Notification"}
        </Button>
      </form>
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: NotificationTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-1">{template.key}</h3>
          <p className="text-sm text-gray-600 mb-2">{template.title}</p>
          <p className="text-sm text-gray-500">{template.body}</p>
        </div>
        <div className="flex gap-2 ml-4">
          <button
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex gap-2">
          {template.channels.map((channel) => (
            <Badge key={channel} variant="outline" className="capitalize">
              {channel}
            </Badge>
          ))}
        </div>
        <Badge
          className={
            template.enabled
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }
        >
          {template.enabled ? "Active" : "Inactive"}
        </Badge>
      </div>
    </div>
  );
}

function TemplateDialog({
  template,
  onClose,
  onSave,
}: {
  template: NotificationTemplate | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    key: template?.key || "",
    title: template?.title || "",
    body: template?.body || "",
    channels: template?.channels || ["push"],
    email_subject: template?.email_subject || "",
    email_body: template?.email_body || "",
    sms_body: template?.sms_body || "",
    live_activities_config: template?.live_activities_config || null,
    variables: template?.variables?.join(",") || "",
    url: template?.url || "",
    image: template?.image || "",
    onesignal_template_id: template?.onesignal_template_id || "",
    enabled: template?.enabled ?? true,
    description: template?.description || "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const payload = {
        ...formData,
        variables: formData.variables
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v),
      };

      if (template) {
        await fetcher.put(`/api/admin/notifications/templates/${template.id}`, payload);
        toast.success("Template updated");
      } else {
        await fetcher.post("/api/admin/notifications/templates", payload);
        toast.success("Template created");
      }
      onSave();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "Add Template"}</DialogTitle>
          <DialogDescription>
            Create a reusable notification template with variables
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="key">Template Key *</Label>
            <Input
              id="key"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              required
              disabled={!!template}
            />
          </div>
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="channels">Channels *</Label>
            <div className="flex gap-4 mt-2">
              {["push", "email", "sms", "live_activities"].map((channel) => (
                <label key={channel} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.channels.includes(channel)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, channels: [...formData.channels, channel] });
                      } else {
                        setFormData({ ...formData, channels: formData.channels.filter((c) => c !== channel) });
                      }
                    }}
                  />
                  <span className="capitalize">{channel.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="body">Body (Push) *</Label>
            <textarea
              id="body"
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              className="w-full p-2 border rounded-md min-h-[100px]"
              required
            />
          </div>
          {formData.channels.includes("email") && (
            <>
              <div>
                <Label htmlFor="email_subject">Email Subject</Label>
                <Input
                  id="email_subject"
                  value={formData.email_subject}
                  onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
                  placeholder="Leave empty to use title"
                />
              </div>
              <div>
                <Label htmlFor="email_body">Email Body</Label>
                <textarea
                  id="email_body"
                  value={formData.email_body}
                  onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
                  className="w-full p-2 border rounded-md min-h-[150px]"
                  placeholder="Leave empty to use body (supports HTML)"
                />
              </div>
            </>
          )}
          {formData.channels.includes("sms") && (
            <div>
              <Label htmlFor="sms_body">SMS Body</Label>
              <textarea
                id="sms_body"
                value={formData.sms_body}
                onChange={(e) => setFormData({ ...formData, sms_body: e.target.value })}
                className="w-full p-2 border rounded-md min-h-[80px]"
                placeholder="Leave empty to use body (160 chars for single SMS)"
                maxLength={1600}
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.sms_body.length || formData.body.length} characters
              </p>
            </div>
          )}
          {formData.channels.includes("live_activities") && (
            <div>
              <Label htmlFor="live_activities_config">Live Activities Config (JSON)</Label>
              <textarea
                id="live_activities_config"
                value={formData.live_activities_config ? JSON.stringify(formData.live_activities_config, null, 2) : ""}
                onChange={(e) => {
                  try {
                    const parsed = e.target.value ? JSON.parse(e.target.value) : null;
                    setFormData({ ...formData, live_activities_config: parsed });
                  } catch {
                    // Invalid JSON, keep as is
                  }
                }}
                className="w-full p-2 border rounded-md min-h-[100px] font-mono text-sm"
                placeholder='{"event": "update", "priority": "active"}'
              />
            </div>
          )}
          <div>
            <Label htmlFor="variables">Variables (comma-separated)</Label>
            <Input
              id="variables"
              value={formData.variables}
              onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
              placeholder="name, amount, booking_number"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use {"{{variable_name}}"} in title/body to insert variables
            </p>
          </div>
          <div>
            <Label htmlFor="url">Deep Link URL (optional)</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="image">Image URL (optional)</Label>
            <Input
              id="image"
              type="url"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="onesignal_template_id">OneSignal Template ID (optional)</Label>
            <Input
              id="onesignal_template_id"
              value={formData.onesignal_template_id}
              onChange={(e) => setFormData({ ...formData, onesignal_template_id: e.target.value })}
              placeholder="If using OneSignal's template system"
            />
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-md min-h-[60px]"
              placeholder="Template description for admin reference"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : template ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

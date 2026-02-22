"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  title_template: string;
  message_template: string;
  priority: 'low' | 'medium' | 'high';
  channels: string[];
  enabled: boolean;
  variables?: string[];
  created_at: string;
  updated_at: string;
}

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    title_template: "",
    message_template: "",
    priority: "medium" as "low" | "medium" | "high",
    channels: [] as string[],
    enabled: true,
    variables: [] as string[],
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ templates: NotificationTemplate[] }>('/api/admin/notification-templates');
      setTemplates(response.templates || []);
    } catch {
      toast.error("Failed to load notification templates");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      type: "",
      title_template: "",
      message_template: "",
      priority: "medium",
      channels: [],
      enabled: true,
      variables: [],
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      title_template: template.title_template,
      message_template: template.message_template,
      priority: template.priority,
      channels: template.channels,
      enabled: template.enabled,
      variables: template.variables || [],
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await fetcher.delete(`/api/admin/notification-templates/${id}`);
      toast.success("Template deleted successfully");
      loadTemplates();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handleSave = async () => {
    try {
      if (editingTemplate) {
        await fetcher.patch(`/api/admin/notification-templates/${editingTemplate.id}`, formData);
        toast.success("Template updated successfully");
      } else {
        await fetcher.post('/api/admin/notification-templates', formData);
        toast.success("Template created successfully");
      }
      setIsDialogOpen(false);
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to save template");
    }
  };

  const toggleChannel = (channel: string) => {
    setFormData((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const notificationTypes = [
    { value: 'appointment_reminder', label: 'Appointment Reminder' },
    { value: 'appointment_cancelled', label: 'Appointment Cancelled' },
    { value: 'appointment_rescheduled', label: 'Appointment Rescheduled' },
    { value: 'new_appointment', label: 'New Appointment' },
    { value: 'payment_received', label: 'Payment Received' },
    { value: 'payout_processed', label: 'Payout Processed' },
    { value: 'refund_processed', label: 'Refund Processed' },
    { value: 'new_client', label: 'New Client' },
    { value: 'client_message', label: 'Client Message' },
    { value: 'staff_clock_in', label: 'Staff Clock In' },
    { value: 'staff_clock_out', label: 'Staff Clock Out' },
    { value: 'shift_reminder', label: 'Shift Reminder' },
    { value: 'service_booking', label: 'Service Booking' },
    { value: 'product_order', label: 'Product Order' },
    { value: 'team_member_added', label: 'Team Member Added' },
    { value: 'team_member_updated', label: 'Team Member Updated' },
    { value: 'system_update', label: 'System Update' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'report_ready', label: 'Report Ready' },
    { value: 'document_ready', label: 'Document Ready' },
    { value: 'payment_failed', label: 'Payment Failed' },
    { value: 'subscription_expiring', label: 'Subscription Expiring' },
    { value: 'account_verification', label: 'Account Verification' },
    { value: 'high_priority', label: 'High Priority' },
  ];

  return (
    <SettingsDetailLayout
      title="Notification Templates"
      subtitle="Manage notification templates for providers and clients"
      showCloseButton={false}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex justify-end">
          <Button
            onClick={handleCreate}
            className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>

        {isLoading ? (
          <SectionCard>
            <Skeleton className="h-64 w-full" />
          </SectionCard>
        ) : templates.length === 0 ? (
          <SectionCard className="p-8 sm:p-12 text-center">
            <Bell className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No notification templates found</p>
            <Button onClick={handleCreate} className="min-h-[44px] touch-manipulation">
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </SectionCard>
        ) : (
          <SectionCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{template.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            template.priority === 'high'
                              ? 'bg-red-100 text-red-800'
                              : template.priority === 'medium'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }
                        >
                          {template.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {template.channels.map((channel) => (
                            <Badge key={channel} variant="outline" className="text-xs">
                              {channel}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {template.enabled ? (
                          <Badge className="bg-green-100 text-green-800">Enabled</Badge>
                        ) : (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(template)}
                            className="min-h-[36px] touch-manipulation"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                            className="text-red-600 hover:text-red-700 min-h-[36px] touch-manipulation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-semibold">
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            <div>
              <Label htmlFor="name" className="text-sm sm:text-base">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1.5 min-h-[44px] touch-manipulation"
                placeholder="e.g., Appointment Reminder"
                required
              />
            </div>

            <div>
              <Label htmlFor="type" className="text-sm sm:text-base">Notification Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {notificationTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title_template" className="text-sm sm:text-base">Title Template *</Label>
              <Input
                id="title_template"
                value={formData.title_template}
                onChange={(e) => setFormData({ ...formData, title_template: e.target.value })}
                className="mt-1.5 min-h-[44px] touch-manipulation"
                placeholder="e.g., Appointment Reminder: {{service_name}}"
                required
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Use {`{{variable_name}}`} for dynamic content
              </p>
            </div>

            <div>
              <Label htmlFor="message_template" className="text-sm sm:text-base">Message Template *</Label>
              <Textarea
                id="message_template"
                value={formData.message_template}
                onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
                className="mt-1.5 min-h-[100px] touch-manipulation"
                placeholder="e.g., Your appointment for {{service_name}} is scheduled for {{appointment_date}} at {{appointment_time}}."
                required
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Use {`{{variable_name}}`} for dynamic content
              </p>
            </div>

            <div>
              <Label htmlFor="priority" className="text-sm sm:text-base">Priority *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm sm:text-base mb-2 block">Channels *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['email', 'sms', 'push', 'in_app'].map((channel) => (
                  <div
                    key={channel}
                    className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleChannel(channel)}
                  >
                    <input
                      type="checkbox"
                      checked={formData.channels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                      className="w-4 h-4"
                    />
                    <div className="flex items-center gap-2">
                      {channel === 'email' && <Mail className="w-4 h-4" />}
                      {channel === 'sms' && <MessageSquare className="w-4 h-4" />}
                      {channel === 'push' && <Smartphone className="w-4 h-4" />}
                      {channel === 'in_app' && <Bell className="w-4 h-4" />}
                      <span className="text-sm capitalize">{channel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-sm sm:text-base font-medium cursor-pointer">
                  Enabled
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Enable this template to send notifications
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {editingTemplate ? "Update" : "Create"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}

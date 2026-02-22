"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Mail, MessageSquare, Send, Edit, Trash2, Users, MessageCircle } from "lucide-react";
import { FetchError } from "@/lib/http/fetcher";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { format } from "date-fns";
import ClientSelector from "./components/ClientSelector";
import SegmentBuilder from "./components/SegmentBuilder";

interface Campaign {
  id: string;
  name: string;
  type: "email" | "sms" | "whatsapp";
  subject?: string;
  content: string;
  recipient_type: "all_clients" | "segment" | "custom";
  recipient_ids?: string[];
  segment_criteria?: {
    min_bookings?: number;
    max_bookings?: number;
    min_spent?: number;
    max_spent?: number;
    last_booking_days?: number;
    tags?: string[];
    is_favorite?: boolean;
  };
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  scheduled_at?: string;
  sent_at?: string;
  total_recipients: number;
  sent_count: number;
  opened_count?: number;
  clicked_count?: number;
  created_at: string;
}

export default function MarketingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<"email" | "sms" | "whatsapp">("email");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "email" as "email" | "sms" | "whatsapp",
    subject: "",
    content: "",
    recipient_type: "all_clients" as "all_clients" | "segment" | "custom",
    recipient_ids: [] as string[],
    segment_criteria: {} as Campaign["segment_criteria"],
    scheduled_at: "",
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCampaigns();
      setCampaigns((data || []) as unknown as Campaign[]);
    } catch (error) {
      console.error("Failed to load campaigns:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setFormData({
      name: "",
      type: "email",
      subject: "",
      content: "",
      recipient_type: "all_clients",
      recipient_ids: [],
      segment_criteria: {},
      scheduled_at: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setFormData({
      name: campaign.name,
      type: campaign.type,
      subject: campaign.subject || "",
      content: campaign.content,
      recipient_type: campaign.recipient_type,
      recipient_ids: campaign.recipient_ids || [],
      segment_criteria: campaign.segment_criteria || {},
      scheduled_at: campaign.scheduled_at || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.name || !formData.content) {
        toast.error("Please fill in all required fields");
        return;
      }

      if (formData.type === "email" && !formData.subject) {
        toast.error("Email campaigns require a subject");
        return;
      }

      if (formData.recipient_type === "custom" && formData.recipient_ids.length === 0) {
        toast.error("Please select at least one client for custom recipient list");
        return;
      }

      if (formData.recipient_type === "segment") {
        const hasCriteria = Object.keys(formData.segment_criteria || {}).length > 0;
        if (!hasCriteria) {
          toast.error("Please set at least one segmentation criteria");
          return;
        }
      }

      const payload: any = {
        name: formData.name,
        type: formData.type,
        content: formData.content,
        recipient_type: formData.recipient_type,
      };

      if (formData.type === "email") {
        payload.subject = formData.subject;
      }

      if (formData.recipient_type === "custom") {
        payload.recipient_ids = formData.recipient_ids;
      }

      if (formData.recipient_type === "segment") {
        payload.segment_criteria = formData.segment_criteria;
      }

      if (formData.scheduled_at) {
        payload.scheduled_at = formData.scheduled_at;
      }

      if (selectedCampaign) {
        await providerApi.updateCampaign(selectedCampaign.id, payload);
        toast.success("Campaign updated successfully");
      } else {
        await providerApi.createCampaign(payload);
        toast.success("Campaign created successfully");
      }

      setIsDialogOpen(false);
      loadCampaigns();
    } catch (error) {
      const errorMessage = error instanceof FetchError ? error.message : "Failed to save campaign";
      toast.error(errorMessage);
    }
  };

  const handleSend = async (campaignId: string) => {
    try {
      await providerApi.sendCampaign(campaignId);
      toast.success("Campaign sent successfully");
      loadCampaigns();
    } catch (error) {
      const errorMessage = error instanceof FetchError ? error.message : "Failed to send campaign";
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    try {
      await providerApi.deleteCampaign(campaignId);
      toast.success("Campaign deleted successfully");
      loadCampaigns();
    } catch (error) {
      const errorMessage = error instanceof FetchError ? error.message : "Failed to delete campaign";
      toast.error(errorMessage);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      scheduled: "secondary",
      sending: "default",
      sent: "default",
      cancelled: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (activeTab === "whatsapp") {
      return c.type === "whatsapp";
    }
    return c.type === activeTab;
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Marketing Campaigns" subtitle="Create and manage email and SMS campaigns" />
        <LoadingTimeout loadingMessage="Loading campaigns..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Marketing Campaigns"
        subtitle="Create and manage email, SMS, and WhatsApp campaigns to engage with your clients"
      />

      <div className="mb-6 flex justify-end">
        <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
          <Plus className="w-4 h-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "email" | "sms" | "whatsapp")}>
        <TabsList>
          <TabsTrigger value="email">
            <Mail className="w-4 h-4 mr-2" />
            Email Campaigns
          </TabsTrigger>
          <TabsTrigger value="sms">
            <MessageSquare className="w-4 h-4 mr-2" />
            SMS Campaigns
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredCampaigns.length === 0 ? (
            <EmptyState
              title={`No ${activeTab.toUpperCase()} campaigns yet`}
              description="Create your first campaign to start engaging with your clients"
              action={{
                label: "Create Campaign",
                onClick: handleCreate,
              }}
            />
          ) : (
            <SectionCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>
                        {campaign.type === "email" ? (
                          <Mail className="w-4 h-4 text-blue-600" />
                        ) : campaign.type === "whatsapp" ? (
                          <MessageCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-green-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-gray-400" />
                          {campaign.sent_count > 0
                            ? `${campaign.sent_count} / ${campaign.total_recipients}`
                            : campaign.total_recipients}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                      <TableCell>
                        {campaign.sent_at
                          ? format(new Date(campaign.sent_at), "MMM d, yyyy")
                          : campaign.scheduled_at
                          ? format(new Date(campaign.scheduled_at), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>{format(new Date(campaign.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {campaign.status === "draft" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(campaign)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSend(campaign.id)}
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {campaign.status !== "sent" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(campaign.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCampaign ? "Edit Campaign" : "Create Campaign"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Summer Promotion 2025"
              />
            </div>

            <div>
              <Label htmlFor="type">Campaign Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as "email" | "sms" | "whatsapp" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "email" && (
              <div>
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Special Offer: 20% Off All Services"
                />
              </div>
            )}

            <div>
              <Label htmlFor="content">Message Content *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={
                  formData.type === "email" 
                    ? "Enter your email content here..." 
                    : formData.type === "whatsapp"
                    ? "Enter your WhatsApp message here..."
                    : "Enter your SMS message here..."
                }
                rows={formData.type === "email" ? 10 : 5}
                maxLength={formData.type === "sms" || formData.type === "whatsapp" ? 160 : undefined}
              />
              {(formData.type === "sms" || formData.type === "whatsapp") && (
                <p className="text-sm text-gray-500 mt-1">
                  {formData.content.length}/160 characters
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="recipient_type">Recipients *</Label>
              <Select
                value={formData.recipient_type}
                onValueChange={(value) => {
                  const newRecipientType = value as "all_clients" | "segment" | "custom";
                  setFormData({ 
                    ...formData, 
                    recipient_type: newRecipientType,
                    // Reset related fields when changing recipient type
                    recipient_ids: newRecipientType === "custom" ? formData.recipient_ids : [],
                    segment_criteria: newRecipientType === "segment" ? formData.segment_criteria : {},
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_clients">All Clients</SelectItem>
                  <SelectItem value="segment">Segment</SelectItem>
                  <SelectItem value="custom">Custom List</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.recipient_type === "custom" && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <ClientSelector
                  selectedIds={formData.recipient_ids}
                  onSelectionChange={(ids) => setFormData({ ...formData, recipient_ids: ids })}
                />
              </div>
            )}

            {formData.recipient_type === "segment" && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <SegmentBuilder
                  criteria={formData.segment_criteria || {}}
                  onCriteriaChange={(criteria) => setFormData({ ...formData, segment_criteria: criteria })}
                />
              </div>
            )}

            <div>
              <Label htmlFor="scheduled_at">Schedule (Optional)</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
              />
              <p className="text-sm text-gray-500 mt-1">
                Leave empty to send immediately when you click "Send"
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-[#FF0077] hover:bg-[#D60565]">
              {selectedCampaign ? "Update" : "Create"} Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useTranslation } from "@beautonomi/i18n";

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
import { Plus, Mail, MessageSquare, Send, Edit, Trash2, Users, MessageCircle, Info } from "lucide-react";
import { FetchError, fetcher } from "@/lib/http/fetcher";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { format } from "date-fns";
import ClientSelector from "./components/ClientSelector";
import SegmentBuilder from "./components/SegmentBuilder";
import CampaignPreview from "./components/CampaignPreview";
import { CAMPAIGN_MERGE_TAGS } from "@/lib/marketing/merge-tags";
import { formatCurrency } from "@/lib/utils";

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
  failed_count?: number;
  opened_count?: number;
  clicked_count?: number;
  created_at: string;
}

export default function MarketingCampaignsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<"email" | "sms" | "whatsapp">("email");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditSummary, setCreditSummary] = useState<{
    spent: number;
    topped_up: number;
    refunded: number;
    period_start: string;
  } | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const contentRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [costEstimate, setCostEstimate] = useState<{
    estimated_cost_zar: number;
    sufficient: boolean;
    debited_on_platform_path: boolean;
    recipients: number;
  } | null>(null);

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
    void loadCreditBalance();
  }, []);

  const loadCreditBalance = async () => {
    try {
      const res = await fetcher.get<{
        data: {
          balance: { total_zar: number };
          summary: { spent: number; topped_up: number; refunded: number; period_start: string };
        };
      }>("/api/provider/marketing/credits/ledger");
      setCreditBalance(res.data?.balance?.total_zar ?? null);
      setCreditSummary(res.data?.summary ?? null);
    } catch {
      setCreditBalance(null);
      setCreditSummary(null);
    }
  };

  useEffect(() => {
    void fetcher
      .get<{ data: { business_name?: string | null } }>("/api/provider/profile")
      .then((res) => setBusinessName(res.data?.business_name ?? null))
      .catch(() => setBusinessName(null));
  }, []);

  const insertMergeTag = (tag: string) => {
    const el = contentRef.current;
    if (!el) {
      setFormData((prev) => ({ ...prev, content: `${prev.content}${tag}` }));
      return;
    }
    const start = el.selectionStart ?? formData.content.length;
    const end = el.selectionEnd ?? formData.content.length;
    const next = formData.content.slice(0, start) + tag + formData.content.slice(end);
    setFormData((prev) => ({ ...prev, content: next }));
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + tag.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const handleSendTest = async () => {
    if (!formData.content.trim()) {
      toast.error(t("web.provider.marketingCampaigns.addContentBeforeTest"));
      return;
    }
    if (formData.type === "email" && !formData.subject.trim()) {
      toast.error(t("web.provider.marketingCampaigns.emailTestRequiresSubject"));
      return;
    }
    if (!testRecipient.trim()) {
      toast.error(formData.type === "email" ? t("web.provider.marketingCampaigns.enterTestEmail") : t("web.provider.marketingCampaigns.enterTestPhone"));
      return;
    }
    try {
      setIsSendingTest(true);
      await fetcher.post("/api/provider/campaigns/test-send", {
        type: formData.type,
        subject: formData.type === "email" ? formData.subject : undefined,
        content: formData.content,
        to: testRecipient.trim(),
      });
      toast.success(t("web.provider.marketingCampaigns.testSent", { type: t(`web.provider.marketingCampaigns.${formData.type}`), to: testRecipient.trim() }));
      void loadCreditBalance();
    } catch (error) {
      toastPlanGateError(error, t("web.provider.marketingCampaigns.testFailed"));
    } finally {
      setIsSendingTest(false);
    }
  };

  const estimateRecipientCount = (): number => {
    if (formData.recipient_type === "custom") return formData.recipient_ids.length;
    if (selectedCampaign?.total_recipients) return selectedCampaign.total_recipients;
    return 0;
  };

  useEffect(() => {
    if (!isDialogOpen) {
      setCostEstimate(null);
      return;
    }
    const recipients = estimateRecipientCount();
    if (recipients < 1) {
      setCostEstimate(null);
      return;
    }
    const t = window.setTimeout(() => {
      void fetcher
        .get<{
          data: {
            estimated_cost_zar: number;
            sufficient: boolean;
            debited_on_platform_path: boolean;
            recipients: number;
          };
        }>(
          `/api/provider/marketing/credits/estimate?channel=${encodeURIComponent(formData.type)}&recipients=${recipients}`,
        )
        .then((res) => {
          if (res.data) {
            setCostEstimate({
              estimated_cost_zar: res.data.estimated_cost_zar,
              sufficient: res.data.sufficient,
              debited_on_platform_path: res.data.debited_on_platform_path,
              recipients: res.data.recipients,
            });
          }
        })
        .catch(() => setCostEstimate(null));
    }, 300);
    return () => window.clearTimeout(t);
  }, [isDialogOpen, formData.type, formData.recipient_type, formData.recipient_ids, selectedCampaign?.total_recipients]);

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCampaigns();
      setCampaigns((data || []) as any as Campaign[]);
    } catch (error) {
      const message = error instanceof FetchError ? error.message : t("web.provider.marketingCampaigns.loadFailed");
      toastPlanGateError(error, message);
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
        toast.error(t("web.provider.marketingCampaigns.requiredFields"));
        return;
      }

      if (formData.type === "email" && !formData.subject) {
        toast.error(t("web.provider.marketingCampaigns.emailRequiresSubject"));
        return;
      }

      if (formData.recipient_type === "custom" && formData.recipient_ids.length === 0) {
        toast.error(t("web.provider.marketingCampaigns.selectAtLeastOneClient"));
        return;
      }

      if (formData.recipient_type === "segment") {
        const hasCriteria = Object.keys(formData.segment_criteria || {}).length > 0;
        if (!hasCriteria) {
          toast.error(t("web.provider.marketingCampaigns.setSegmentation"));
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
        toast.success(t("web.provider.marketingCampaigns.updated"));
      } else {
        await providerApi.createCampaign(payload);
        toast.success(t("web.provider.marketingCampaigns.created"));
      }

      setIsDialogOpen(false);
      loadCampaigns();
    } catch (error) {
      toastPlanGateError(error, t("web.provider.marketingCampaigns.saveFailed"));
    }
  };

  const handleSend = async (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (campaign && campaign.total_recipients > 0) {
      try {
        const res = await fetcher.get<{
          data: {
            estimated_cost_zar: number;
            sufficient: boolean;
            debited_on_platform_path: boolean;
          };
        }>(
          `/api/provider/marketing/credits/estimate?channel=${encodeURIComponent(campaign.type)}&recipients=${campaign.total_recipients}`,
        );
        const est = res.data;
        if (est?.debited_on_platform_path && est.estimated_cost_zar > 0) {
          const ok = window.confirm(
            t("web.provider.marketingCampaigns.estimatedCost", { amount: est.estimated_cost_zar.toFixed(2), count: campaign.total_recipients }) +
              (est.sufficient ? t("web.provider.marketingCampaigns.proceed") : t("web.provider.marketingCampaigns.insufficientCredits")),
          );
          if (!ok || !est.sufficient) return;
        }
      } catch {
        // proceed without estimate
      }
    }

    try {
      await providerApi.sendCampaign(campaignId);
      toast.success(t("web.provider.marketingCampaigns.sent"));
      loadCampaigns();
      void loadCreditBalance();
    } catch (error) {
      toastPlanGateError(error, t("web.provider.marketingCampaigns.sendFailed"));
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm(t("web.provider.marketingCampaigns.deleteConfirm"))) return;

    try {
      await providerApi.deleteCampaign(campaignId);
      toast.success(t("web.provider.marketingCampaigns.deleted"));
      loadCampaigns();
    } catch (error) {
      const errorMessage = error instanceof FetchError ? error.message : t("web.provider.marketingCampaigns.deleteFailed");
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
{t(`web.provider.marketingCampaigns.status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
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
        <PageHeader title={t("web.provider.marketingCampaigns.title")} subtitle={t("web.provider.marketingCampaigns.subtitleShort")} />
        <LoadingTimeout loadingMessage={t("web.provider.marketingCampaigns.loading")} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.marketingCampaigns.title")}
        subtitle={t("web.provider.marketingCampaigns.subtitle")}
      />

      {creditBalance != null && (
        <SectionCard className="mb-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-700">
            <span>
<strong>{t("web.provider.marketingCampaigns.marketingCredit")}</strong> {t("web.provider.marketingCampaigns.remaining", { amount: creditBalance.toFixed(2) })}
            </span>
            {creditSummary && (
              <>
                <span className="text-gray-500">
{t("web.provider.marketingCampaigns.spentThisPeriod")} <strong className="text-gray-700">{formatCurrency(creditSummary.spent, "ZAR")}</strong>
                </span>
                <span className="text-gray-500">
{t("web.provider.marketingCampaigns.toppedUp")} <strong className="text-gray-700">{formatCurrency(creditSummary.topped_up, "ZAR")}</strong>
                </span>
                {creditSummary.refunded > 0 && (
                  <span className="text-gray-500">
{t("web.provider.marketingCampaigns.refunded")} <strong className="text-gray-700">{formatCurrency(creditSummary.refunded, "ZAR")}</strong>
                  </span>
                )}
              </>
            )}
            <a href="/provider/settings/marketing-integrations" className="text-primary underline">
              {t("web.provider.marketingCampaigns.topUp")}
            </a>
          </div>
          <p className="mt-1 text-xs text-gray-500">
{t("web.provider.marketingCampaigns.creditsHint")}
          </p>
        </SectionCard>
      )}

      <div className="mb-6 flex justify-end">
        <Button onClick={handleCreate} className="bg-primary hover:bg-primary-hover">
          <Plus className="w-4 h-4 me-2" />
          {t("web.provider.marketingCampaigns.createCampaign")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "email" | "sms" | "whatsapp")}>
        <TabsList>
          <TabsTrigger value="email">
            <Mail className="w-4 h-4 me-2" />
            {t("web.provider.marketingCampaigns.emailCampaigns")}
          </TabsTrigger>
          <TabsTrigger value="sms">
            <MessageSquare className="w-4 h-4 me-2" />
            {t("web.provider.marketingCampaigns.smsCampaigns")}
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <MessageCircle className="w-4 h-4 me-2" />
            {t("web.provider.marketingCampaigns.whatsappCampaigns")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredCampaigns.length === 0 ? (
            <EmptyState
              title={t("web.provider.marketingCampaigns.emptyTitle", { channel: t(`web.provider.marketingCampaigns.${activeTab}`) })}
              description={t("web.provider.marketingCampaigns.emptyDescription")}
              action={{
                label: t("web.provider.marketingCampaigns.createCampaign"),
                onClick: handleCreate,
              }}
            />
          ) : (
            <SectionCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("web.provider.common.name")}</TableHead>
                    <TableHead>{t("web.provider.common.type")}</TableHead>
                    <TableHead>{t("web.provider.marketingCampaigns.recipients")}</TableHead>
                    <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                    <TableHead>{t("web.provider.marketingCampaigns.sentCol")}</TableHead>
                    <TableHead>{t("web.provider.marketingCampaigns.createdCol")}</TableHead>
                    <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
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
                          {campaign.sent_count > 0 || (campaign.failed_count ?? 0) > 0 ? (
                            <span className="flex items-center gap-2">
<span className="text-emerald-700">{t("web.provider.marketingCampaigns.sentCount", { count: campaign.sent_count })}</span>
                              {(campaign.failed_count ?? 0) > 0 && (
<span className="text-red-600">{t("web.provider.marketingCampaigns.failedCount", { count: campaign.failed_count })}</span>
                              )}
<span className="text-gray-400">{t("web.provider.marketingCampaigns.ofTotal", { count: campaign.total_recipients })}</span>
                            </span>
                          ) : (
                            campaign.total_recipients
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                      <TableCell>
                        {campaign.sent_at
                          ? format(new Date(campaign.sent_at), "MMM d, yyyy")
                          : campaign.scheduled_at
                          ? format(new Date(campaign.scheduled_at), "MMM d, yyyy")
: t("web.provider.common.hyphen")}
                      </TableCell>
                      <TableCell>{format(new Date(campaign.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-2">
                          {(campaign.status === "draft" || campaign.status === "scheduled") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(campaign)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {(campaign.status === "draft" || campaign.status === "scheduled") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSend(campaign.id)}
title={campaign.status === "scheduled" ? t("web.provider.marketingCampaigns.sendNow") : t("web.provider.marketingCampaigns.send")}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                          {campaign.status !== "sent" && campaign.status !== "sending" && (
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
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
{selectedCampaign ? t("web.provider.marketingCampaigns.editCampaign") : t("web.provider.marketingCampaigns.createCampaign")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            {/* Editor column */}
            <div className="space-y-4">
            <div>
<Label htmlFor="name">{t("web.provider.marketingCampaigns.campaignName")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
placeholder={t("web.provider.marketingCampaigns.campaignNamePlaceholder")}
              />
            </div>

            <div>
<Label htmlFor="type">{t("web.provider.marketingCampaigns.campaignType")}</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as "email" | "sms" | "whatsapp" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{t("web.provider.marketingCampaigns.email")}</SelectItem>
                  <SelectItem value="sms">{t("web.provider.marketingCampaigns.sms")}</SelectItem>
                  <SelectItem value="whatsapp">{t("web.provider.marketingCampaigns.whatsapp")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "whatsapp" && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
{t("web.provider.marketingCampaigns.whatsappPolicy")}
                </span>
              </div>
            )}

            {formData.type === "email" && (
              <div>
<Label htmlFor="subject">{t("web.provider.marketingCampaigns.subject")}</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
placeholder={t("web.provider.marketingCampaigns.subjectPlaceholder")}
                />
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
<Label htmlFor="content">{t("web.provider.marketingCampaigns.messageContent")}</Label>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-gray-400">{t("web.provider.marketingCampaigns.insert")}</span>
                  {CAMPAIGN_MERGE_TAGS.map((tagDef) => (
                    <button
                      key={tagDef.tag}
                      type="button"
                      onClick={() => insertMergeTag(tagDef.tag)}
                      className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                      title={t("web.provider.marketingCampaigns.insertTag", { tag: tagDef.tag })}
                    >
                      {tagDef.tag === "{{customer_name}}"
                        ? t("web.provider.marketingCampaigns.mergeCustomerName")
                        : tagDef.tag === "{{first_name}}"
                          ? t("web.provider.marketingCampaigns.mergeFirstName")
                          : t("web.provider.marketingCampaigns.mergeBusinessName")}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                id="content"
                ref={contentRef}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder={
                  formData.type === "email" 
                    ? t("web.provider.marketingCampaigns.emailPlaceholder") 
                    : formData.type === "whatsapp"
                    ? t("web.provider.marketingCampaigns.whatsappPlaceholder")
                    : t("web.provider.marketingCampaigns.smsPlaceholder")
                }
                rows={formData.type === "email" ? 10 : 5}
                maxLength={formData.type === "sms" || formData.type === "whatsapp" ? 160 : undefined}
                className="mt-1"
              />
              {(formData.type === "sms" || formData.type === "whatsapp") && (
                <p className="text-sm text-gray-500 mt-1">
{t("web.provider.marketingCampaigns.characterCount", { count: formData.content.length })}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">
{t("web.provider.marketingCampaigns.personalizationHint")}
              </p>
            </div>

            <div>
<Label htmlFor="recipient_type">{t("web.provider.marketingCampaigns.recipientsRequired")}</Label>
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
                  <SelectItem value="all_clients">{t("web.provider.marketingCampaigns.allClients")}</SelectItem>
                  <SelectItem value="segment">{t("web.provider.marketingCampaigns.segment")}</SelectItem>
                  <SelectItem value="custom">{t("web.provider.marketingCampaigns.customList")}</SelectItem>
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

            {costEstimate?.debited_on_platform_path && costEstimate.estimated_cost_zar > 0 && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  costEstimate.sufficient
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
{t("web.provider.marketingCampaigns.estimatedPlatformCost")}{" "}
                <strong>{formatCurrency(costEstimate.estimated_cost_zar, "ZAR")}</strong> {t("web.provider.marketingCampaigns.forRecipients", { count: costEstimate.recipients })}
                {!costEstimate.sufficient && t("web.provider.marketingCampaigns.insufficientTopUp")}
              </div>
            )}

            {isDialogOpen && estimateRecipientCount() === 0 && formData.recipient_type !== "custom" && (
              <p className="text-xs text-gray-500">
{t("web.provider.marketingCampaigns.saveToEstimate")}
              </p>
            )}

            <div>
<Label htmlFor="scheduled_at">{t("web.provider.marketingCampaigns.scheduleOptional")}</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
              />
              <p className="text-sm text-gray-500 mt-1">
{t("web.provider.marketingCampaigns.scheduleHint")}
              </p>
            </div>
            </div>

            {/* Preview column */}
            <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
<Label className="text-xs uppercase tracking-wide text-gray-400">{t("web.provider.marketingCampaigns.livePreview")}</Label>
              <CampaignPreview
                type={formData.type}
                subject={formData.subject}
                content={formData.content}
                businessName={businessName}
              />

              <div className="rounded-lg border border-gray-200 p-3">
                <Label htmlFor="test_recipient" className="text-sm">
                  {t("web.provider.marketingCampaigns.sendATest")}
                </Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="test_recipient"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
placeholder={formData.type === "email" ? t("web.provider.marketingCampaigns.testEmailPlaceholder") : t("web.provider.marketingCampaigns.testPhonePlaceholder")}
                    type={formData.type === "email" ? "email" : "tel"}
                  />
                  <Button
                    variant="outline"
                    onClick={handleSendTest}
                    disabled={isSendingTest}
                  >
{isSendingTest ? t("web.provider.marketingCampaigns.sending") : t("web.provider.marketingCampaigns.test")}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
{t("web.provider.marketingCampaigns.testHint")}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-primary-hover">
{selectedCampaign ? t("web.provider.marketingCampaigns.updateCampaign") : t("web.provider.marketingCampaigns.createCampaignCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

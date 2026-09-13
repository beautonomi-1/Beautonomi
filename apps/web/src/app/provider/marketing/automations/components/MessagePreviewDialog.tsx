"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Mail, Smartphone } from "lucide-react";

interface MessagePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  automation: {
    id: string;
    name: string;
    description: string;
    trigger: string;
    type: "reminder" | "update" | "booking" | "milestone";
    action_type?: string;
    message_template?: string;
    subject?: string;
  };
  onSave: (messageTemplate: string, subject?: string) => Promise<void>;
}

export function MessagePreviewDialog({
  open,
  onClose,
  automation,
  onSave,
}: MessagePreviewDialogProps) {
  const { t } = useTranslation();
  const [messageTemplate, setMessageTemplate] = useState(
    automation.message_template || ""
  );
  const [subject, setSubject] = useState(automation.subject || "");
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState("");

  // Generate preview with sample data
  const generatePreview = () => {
    let previewText = messageTemplate;
    const sampleName = t("web.provider.marketing.automations.messagePreview.sampleName");
    previewText = previewText.replace(/\{\{name\}\}/g, sampleName);
    previewText = previewText.replace(/\{\{customer_name\}\}/g, sampleName);
    previewText = previewText.replace(/\{\{appointment_date\}\}/g, t("web.provider.marketing.automations.messagePreview.sampleDate"));
    previewText = previewText.replace(/\{\{appointment_time\}\}/g, t("web.provider.marketing.automations.messagePreview.sampleTime"));
    previewText = previewText.replace(/\{\{booking_number\}\}/g, t("web.provider.marketing.automations.messagePreview.sampleBooking"));
    previewText = previewText.replace(/\{\{package_expiry_date\}\}/g, t("web.provider.marketing.automations.messagePreview.sampleExpiry"));
    setPreview(previewText);
  };

  React.useEffect(() => {
    generatePreview();
  }, [messageTemplate]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(messageTemplate, subject || undefined);
      onClose();
    } catch (error) {
      console.error("Failed to save message:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const actionType = automation.action_type || "sms";
  const isEmail = actionType === "email";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEmail ? (
              <Mail className="w-5 h-5" />
            ) : (
              <Smartphone className="w-5 h-5" />
            )}
{t("web.provider.marketing.automations.messagePreview.title", { name: automation.name })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
<Label>{t("web.provider.marketing.automations.messagePreview.trigger")}</Label>
            <Badge variant="outline" className="mt-1">
              {automation.trigger}
            </Badge>
          </div>

          {isEmail && (
            <div>
              <Label htmlFor="subject">{t("web.provider.marketing.automations.messagePreview.emailSubject")}</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("web.provider.marketing.automations.messagePreview.emailSubjectPlaceholder")}
                className="mt-1"
              />
            </div>
          )}

          <div>
            <Label htmlFor="message">{t("web.provider.marketing.automations.messagePreview.messageTemplate")}</Label>
            <Textarea
              id="message"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder={t("web.provider.marketing.automations.messagePreview.messagePlaceholder", { tokens: "{{name}}, {{appointment_date}}, etc." })}
              className="mt-1 min-h-[150px] font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              {t("web.provider.marketing.automations.messagePreview.availableVars", { vars: "{{name}}, {{appointment_date}}, {{appointment_time}}, {{booking_number}}, {{package_expiry_date}}" })}
            </p>
          </div>

          <div>
<Label>{t("web.provider.marketing.automations.messagePreview.preview")}</Label>
            <div className="mt-1 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-start gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5" />
                <div className="flex-1">
                  {isEmail && subject && (
                    <div className="font-semibold text-sm mb-2">{subject}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{preview || t("web.provider.marketing.automations.messagePreview.previewEmpty")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t("web.provider.common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !messageTemplate}>
            {isSaving ? t("web.provider.common.saving") : t("web.provider.marketing.automations.messagePreview.saveTemplate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

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
  const [messageTemplate, setMessageTemplate] = useState(
    automation.message_template || ""
  );
  const [subject, setSubject] = useState(automation.subject || "");
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState("");

  // Generate preview with sample data
  const generatePreview = () => {
    let previewText = messageTemplate;
    previewText = previewText.replace(/\{\{name\}\}/g, "Sarah");
    previewText = previewText.replace(/\{\{customer_name\}\}/g, "Sarah");
    previewText = previewText.replace(/\{\{appointment_date\}\}/g, "March 15, 2024");
    previewText = previewText.replace(/\{\{appointment_time\}\}/g, "2:00 PM");
    previewText = previewText.replace(/\{\{booking_number\}\}/g, "BK-12345");
    previewText = previewText.replace(/\{\{package_expiry_date\}\}/g, "April 1, 2024");
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
            Message Template: {automation.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Trigger</Label>
            <Badge variant="outline" className="mt-1">
              {automation.trigger}
            </Badge>
          </div>

          {isEmail && (
            <div>
              <Label htmlFor="subject">Email Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject"
                className="mt-1"
              />
            </div>
          )}

          <div>
            <Label htmlFor="message">Message Template</Label>
            <Textarea
              id="message"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Enter your message template. Use {{name}}, {{appointment_date}}, etc. for personalization."
              className="mt-1 min-h-[150px] font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Available variables: {`{{name}}`}, {`{{appointment_date}}`}, {`{{appointment_time}}`}, {`{{booking_number}}`}, {`{{package_expiry_date}}`}
            </p>
          </div>

          <div>
            <Label>Preview</Label>
            <div className="mt-1 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-start gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5" />
                <div className="flex-1">
                  {isEmail && subject && (
                    <div className="font-semibold text-sm mb-2">{subject}</div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{preview || "Preview will appear here..."}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !messageTemplate}>
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

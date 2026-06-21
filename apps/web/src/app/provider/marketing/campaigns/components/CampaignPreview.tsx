"use client";

import React, { useMemo } from "react";
import { Mail, MessageSquare, MessageCircle } from "lucide-react";
import { substituteMergeTags, MERGE_TAG_PREVIEW_SAMPLE } from "@/lib/marketing/merge-tags";

type ChannelType = "email" | "sms" | "whatsapp";

interface CampaignPreviewProps {
  type: ChannelType;
  subject?: string;
  content: string;
  businessName?: string | null;
}

/**
 * Renders a faithful preview of how a campaign message will appear to the
 * recipient, with merge tags resolved against sample data. Email is shown in a
 * sandboxed iframe (HTML-capable); SMS/WhatsApp are shown as phone bubbles.
 */
export default function CampaignPreview({
  type,
  subject,
  content,
  businessName,
}: CampaignPreviewProps) {
  const sample = useMemo(
    () => ({ ...MERGE_TAG_PREVIEW_SAMPLE, business_name: businessName || MERGE_TAG_PREVIEW_SAMPLE.business_name }),
    [businessName],
  );

  const resolvedSubject = useMemo(
    () => substituteMergeTags(subject ?? "", sample),
    [subject, sample],
  );
  const resolvedContent = useMemo(
    () => substituteMergeTags(content ?? "", sample),
    [content, sample],
  );

  if (!content.trim()) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400">
        Start typing your message to see a live preview here.
      </div>
    );
  }

  if (type === "email") {
    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1f2937; line-height:1.6; }
        .wrap { padding:20px; }
      </style></head>
      <body><div class="wrap">${resolvedContent.replace(/\n/g, "<br/>")}</div></body></html>`;

    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <Mail className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium text-gray-500">Email preview</span>
        </div>
        <div className="space-y-1 border-b border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400">
            From: <span className="text-gray-700">{sample.business_name}</span>
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {resolvedSubject || <span className="text-gray-400">(no subject)</span>}
          </p>
        </div>
        <iframe
          title="Email preview"
          srcDoc={emailHtml}
          sandbox=""
          className="h-[280px] w-full bg-white"
        />
      </div>
    );
  }

  const isWhatsApp = type === "whatsapp";
  const bubbleColor = isWhatsApp ? "bg-[#dcf8c6]" : "bg-blue-500 text-white";
  const ChannelIcon = isWhatsApp ? MessageCircle : MessageSquare;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
        <ChannelIcon className={`h-4 w-4 ${isWhatsApp ? "text-green-600" : "text-green-500"}`} />
        <span className="text-xs font-medium text-gray-500">
          {isWhatsApp ? "WhatsApp preview" : "SMS preview"}
        </span>
      </div>
      <div
        className={`min-h-[260px] p-4 ${
          isWhatsApp
            ? "bg-[#e5ddd5] bg-[url('data:image/svg+xml;utf8,')]"
            : "bg-gray-100"
        }`}
      >
        <div className="mx-auto max-w-[280px]">
          <div className="mb-2 text-center text-[11px] text-gray-500">{sample.business_name}</div>
          <div
            className={`relative rounded-2xl px-3 py-2 text-sm shadow ${bubbleColor} ${
              isWhatsApp ? "rounded-tl-sm" : "ml-auto rounded-tr-sm"
            }`}
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {resolvedContent}
            <div
              className={`mt-1 text-right text-[10px] ${
                isWhatsApp ? "text-gray-500" : "text-blue-100"
              }`}
            >
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-gray-500">
            {content.length} characters
            {(type === "sms" || type === "whatsapp") && content.length > 160
              ? " · may split into multiple messages"
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

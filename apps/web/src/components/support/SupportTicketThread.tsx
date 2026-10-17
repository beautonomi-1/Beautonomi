"use client";

import { Loader2 } from "lucide-react";
import { LinkifiedMessageText } from "@/lib/support/linkify-message";

export type SupportThreadMessage = {
  id: string;
  message: string;
  created_at: string;
  author_name?: string;
  is_mine?: boolean;
  author_kind?: string | null;
  attachments?: unknown;
};

type SupportTicketThreadProps = {
  messages: SupportThreadMessage[];
  assistantPending?: boolean;
  className?: string;
};

export function SupportTicketThread({ messages, assistantPending, className }: SupportTicketThreadProps) {
  return (
    <div className={className ?? "space-y-3"} aria-live="polite" aria-relevant="additions">
      {messages.map((m) => {
        const isOwn = m.is_mine === true;
        const isAssistant = m.author_kind === "assistant" || (!isOwn && m.author_name?.includes("Assistant"));
        const authorLabel = m.author_name ?? (isOwn ? "You" : isAssistant ? "Beautonomi Assistant" : "Support Team");
        return (
          <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                isOwn
                  ? "bg-[#FF0077] text-white rounded-br-sm"
                  : isAssistant
                    ? "border border-violet-100 bg-violet-50 text-gray-900 rounded-bl-sm"
                    : "border border-blue-100 bg-blue-50 text-gray-900 rounded-bl-sm"
              }`}
            >
              <p
                className={`mb-1 flex items-center gap-2 text-xs font-semibold ${
                  isOwn ? "text-pink-100" : isAssistant ? "text-violet-700" : "text-blue-700"
                }`}
              >
                <span>{authorLabel}</span>
                {!isOwn && !isAssistant ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-blue-700">Support team</span>
                ) : null}
                {isAssistant ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-violet-700">AI</span>
                ) : null}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                <LinkifiedMessageText
                  text={m.message}
                  linkClassName={
                    isOwn ? "underline text-pink-50 break-all" : "underline text-[#FF0077] break-all"
                  }
                />
              </p>
              <p className={`text-xs mt-1.5 ${isOwn ? "text-pink-200" : "text-gray-400"}`}>
                {new Date(m.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
      {assistantPending ? (
        <div className="flex justify-start">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            <Loader2 className="inline h-4 w-4 animate-spin me-2" aria-hidden />
            Assistant is typing…
          </div>
        </div>
      ) : null}
    </div>
  );
}

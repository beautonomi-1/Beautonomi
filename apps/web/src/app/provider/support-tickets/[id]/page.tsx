"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import { SupportTicketThread } from "@/components/support/SupportTicketThread";

type Message = {
  id: string;
  message: string;
  created_at: string;
  author_name?: string | null;
  is_mine?: boolean;
  author_kind?: string | null;
};

type TicketDetail = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  handling_mode?: string | null;
};

export default function ProviderSupportTicketDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [assistantPending, setAssistantPending] = useState(false);
  const assistantStreamingRef = useRef(false);
  const initialAssistantStreamRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id || assistantStreamingRef.current) return;
    try {
      if (!opts?.silent) setLoading(true);
      const res = await fetcher.get<{
        data: { ticket: TicketDetail; messages: Message[] };
      }>(`/api/provider/support-tickets/${id}`);
      setTicket(res.data.ticket);
      setMessages(res.data.messages ?? []);
    } catch (err) {
toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.support-tickets/[id].loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ms = ticket?.handling_mode === "assistant" ? 2_000 : 30_000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !assistantStreamingRef.current) {
        void load({ silent: true });
      }
    }, ms);
    return () => window.clearInterval(interval);
  }, [load, ticket?.handling_mode]);

  const runAssistantStream = useCallback(
    async (mode: "initial" | "follow_up", userMessage: string) => {
      if (!id) return;
      assistantStreamingRef.current = true;
      setAssistantPending(false);
      const streamAssistantId = `stream-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: streamAssistantId,
          message: "",
          created_at: new Date().toISOString(),
          author_name: t("web.provider.pages.support-tickets/[id].assistantName"),
          is_mine: false,
          author_kind: "assistant",
        },
      ]);
      try {
        const { streamAssistantReply } = await import("@/lib/support/support-assistant/client-stream-reply");
        const streamResult = await streamAssistantReply({
          streamUrl: `/api/provider/support-tickets/${id}/assistant-messages/stream`,
          message: userMessage,
          body: { mode },
          onAssistantChunk: (text) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === streamAssistantId ? { ...m, message: text } : m)),
            );
          },
        });
        if (streamResult.handoff) {
          toast.info(streamResult.infoMessage ?? "Connecting you to support.");
        } else if (!streamResult.ok && streamResult.errorCode !== "IN_FLIGHT") {
          toast.error(streamResult.errorMessage ?? "Assistant unavailable");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Assistant unavailable");
      } finally {
        assistantStreamingRef.current = false;
        await load();
      }
    },
    [id, load, t],
  );

  useEffect(() => {
    if (!ticket || !id || initialAssistantStreamRef.current) return;
    if (ticket.handling_mode !== "assistant" || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.author_kind === "assistant") return;
    if (!last.is_mine) return;
    initialAssistantStreamRef.current = true;
    void runAssistantStream("initial", last.message);
  }, [ticket, messages, id, runAssistantStream]);

  const sendReply = async () => {
    const msg = reply.trim();
    if (!msg) return;
    const isAssistant = (ticket?.handling_mode ?? "human") === "assistant";
    try {
      setSending(true);
      if (isAssistant) {
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            message: msg,
            created_at: new Date().toISOString(),
            author_name: "You",
            is_mine: true,
            author_kind: "customer",
          },
        ]);
        setReply("");
        await runAssistantStream("follow_up", msg);
      } else {
        await fetcher.post(`/api/provider/support-tickets/${id}/messages`, { message: msg });
        setReply("");
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.support-tickets/[id].sendFailed"));
    } finally {
      setSending(false);
      setAssistantPending(false);
    }
  };

  if (loading) {
return <LoadingTimeout loadingMessage={t("web.provider.pages.support-tickets/[id].loading")} />;
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center text-gray-600">
{t("web.provider.pages.support-tickets/[id].notFound")}{" "}
        <Link href="/provider/support-tickets" className="text-primary underline">
{t("web.provider.pages.support-tickets/[id].backToTickets")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ticket.subject}
        subtitle={`#${ticket.ticket_number} · ${ticket.status.replace(/_/g, " ")}`}
        breadcrumbs={[
{ label: t("web.provider.moreHub.title"), href: "/provider/more" },
{ label: t("web.provider.pages.support-tickets.title"), href: "/provider/support-tickets" },
          { label: ticket.ticket_number },
        ]}
      />

      <SupportTicketThread className="mt-6 max-w-2xl" messages={messages} assistantPending={assistantPending} />

      <div className="mt-6 max-w-2xl space-y-3">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
placeholder={t("web.provider.pages.support-tickets/[id].replyPlaceholder")}
          rows={4}
        />
        <Button onClick={() => void sendReply()} disabled={sending || !reply.trim()}>
{sending ? t("web.provider.pages.support-tickets/[id].sending") : t("web.provider.pages.support-tickets/[id].sendReply")}
        </Button>
      </div>
    </div>
  );
}

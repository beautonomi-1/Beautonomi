"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";

type Message = {
  id: string;
  message: string;
  created_at: string;
  author_name?: string | null;
  is_mine?: boolean;
};

type TicketDetail = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
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

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
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

  const sendReply = async () => {
    if (!reply.trim()) return;
    try {
      setSending(true);
      await fetcher.post(`/api/provider/support-tickets/${id}/messages`, {
        message: reply.trim(),
      });
      setReply("");
      await load();
    } catch (err) {
toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.support-tickets/[id].sendFailed"));
    } finally {
      setSending(false);
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

      <div className="mt-6 space-y-3 max-w-2xl">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-3 text-sm ${
              m.is_mine ? "border-indigo-100 bg-indigo-50 ms-8" : "border-gray-100 bg-white me-8"
            }`}
          >
            <p className="text-xs text-gray-500 mb-1">
{m.author_name ?? t("web.provider.pages.support-tickets/[id].support")} · {new Date(m.created_at).toLocaleString()}
            </p>
            <p className="text-gray-800 whitespace-pre-wrap">{m.message}</p>
          </div>
        ))}
      </div>

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

"use client";

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
      toast.error(err instanceof FetchError ? err.message : "Failed to load ticket");
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
      toast.error(err instanceof FetchError ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <LoadingTimeout loadingMessage="Loading ticket…" />;
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center text-gray-600">
        Ticket not found.{" "}
        <Link href="/provider/support-tickets" className="text-primary underline">
          Back to tickets
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
          { label: "More", href: "/provider/more" },
          { label: "Support tickets", href: "/provider/support-tickets" },
          { label: ticket.ticket_number },
        ]}
      />

      <div className="mt-6 space-y-3 max-w-2xl">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-3 text-sm ${
              m.is_mine ? "border-indigo-100 bg-indigo-50 ml-8" : "border-gray-100 bg-white mr-8"
            }`}
          >
            <p className="text-xs text-gray-500 mb-1">
              {m.author_name ?? "Support"} · {new Date(m.created_at).toLocaleString()}
            </p>
            <p className="text-gray-800 whitespace-pre-wrap">{m.message}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 max-w-2xl space-y-3">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write a reply…"
          rows={4}
        />
        <Button onClick={() => void sendReply()} disabled={sending || !reply.trim()}>
          {sending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}

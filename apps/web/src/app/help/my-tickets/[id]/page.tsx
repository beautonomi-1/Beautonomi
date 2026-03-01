"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";

type Message = {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user_id: string;
};

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export default function MyTicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadTicket = async () => {
    if (!id) return;
    try {
      const res = await fetcher.get<{ data?: { ticket?: Ticket; messages?: Message[] } }>(
        `/api/me/support-tickets/${id}`
      );
      const data = (res as { data?: { ticket?: Ticket; messages?: Message[] } })?.data;
      setTicket(data?.ticket ?? null);
      setMessages(data?.messages ?? []);
    } catch {
      setTicket(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = reply.trim();
    if (!msg || !id) return;
    setSending(true);
    try {
      await fetcher.post(`/api/me/support-tickets/${id}/messages`, { message: msg });
      setReply("");
      await loadTicket();
      toast.success("Reply sent");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-white">
          <BeautonomiHeader />
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <LoadingTimeout loadingMessage="Loading ticket..." />
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (!ticket) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-white pb-20 md:pb-0">
          <BeautonomiHeader />
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <Button variant="ghost" onClick={() => router.push("/help/my-tickets")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My tickets
            </Button>
            <p className="mt-6 text-gray-600">Ticket not found.</p>
          </div>
        </div>
      </AuthGuard>
    );
  }

  const canReply = ticket.status !== "closed" && ticket.status !== "resolved";

  return (
    <AuthGuard>
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Button variant="ghost" onClick={() => router.push("/help/my-tickets")} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to My tickets
          </Button>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-gray-500">{ticket.ticket_number}</span>
                <Badge className={statusColor(ticket.status)}>{ticket.status.replace("_", " ")}</Badge>
              </div>
              <CardTitle className="text-xl">{ticket.subject}</CardTitle>
              <p className="text-sm text-gray-500">
                Created {new Date(ticket.created_at).toLocaleString()}
              </p>
            </CardHeader>
          </Card>

          <div className="space-y-4 mb-8">
            {messages.map((m) => (
              <Card key={m.id}>
                <CardContent className="py-4">
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{m.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {canReply && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add a reply</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleReply} className="space-y-4">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type your message..."
                    rows={4}
                    maxLength={10000}
                    disabled={sending}
                    className="resize-none"
                  />
                  <Button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="bg-[#FF0077] hover:bg-[#D60565]"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send reply
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {(ticket.status === "closed" || ticket.status === "resolved") && (
            <p className="text-sm text-gray-500">
              This ticket is {ticket.status}. To continue the conversation,{" "}
              <Link href="/help/submit-ticket" className="text-[#FF0077] underline">
                submit a new ticket
              </Link>
              .
            </p>
          )}
        </div>
        <Footer />
        <BottomNav />
      </div>
    </AuthGuard>
  );
}

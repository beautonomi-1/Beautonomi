"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from "lucide-react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";
import { labelForSupportTicketCategory } from "@/lib/support/ticket-categories";

type Message = {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user_id: string;
  author_name?: string;
  is_mine?: boolean;
  attachments?: SupportAttachment[];
};

type SupportAttachment = {
  url: string;
  name?: string;
  type?: string;
  size?: number;
};

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  requester_type?: string | null;
  support_context_type?: string | null;
  support_context_label?: string | null;
  csat_score?: number | null;
  csat_comment?: string | null;
  created_at: string;
  updated_at: string;
};

function isImageAttachment(attachment: SupportAttachment): boolean {
  return Boolean(attachment.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(attachment.url));
}

function fileSizeLabel(size?: number): string {
  if (size == null) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function MyTicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [csatScore, setCsatScore] = useState<number | null>(null);
  const [csatComment, setCsatComment] = useState("");
  const [submittingCsat, setSubmittingCsat] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<SupportAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTicket = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetcher.get<{ data?: { ticket?: Ticket; messages?: Message[] } }>(
        `/api/me/support-tickets/${id}`
      );
      const data = (res as { data?: { ticket?: Ticket; messages?: Message[] } })?.data;
      setTicket(data?.ticket ?? null);
      setMessages(data?.messages ?? []);
      setCsatScore(data?.ticket?.csat_score ?? null);
      setCsatComment(data?.ticket?.csat_comment ?? "");
      void fetcher.post(`/api/me/support-tickets/${id}/seen`, {}).catch(() => {});
    } catch {
      setTicket(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadTicket();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadTicket]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !id || uploadingAttachment) return;
    setUploadingAttachment(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((file) => fd.append("files", file));
      const res = await fetch(`/api/me/support-tickets/${id}/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { attachments?: SupportAttachment[] };
        error?: string | { message?: string };
      };
      if (!res.ok) {
        const message =
          typeof json.error === "string" ? json.error : json.error?.message || `Upload failed (${res.status})`;
        throw new Error(message);
      }
      const attachments = json.data?.attachments ?? [];
      setPendingAttachments((prev) => [...prev, ...attachments].slice(0, 10));
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload attachment");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = reply.trim();
    if ((!msg && pendingAttachments.length === 0) || !id) return;
    setSending(true);
    try {
      await fetcher.post(`/api/me/support-tickets/${id}/messages`, { message: msg, attachments: pendingAttachments });
      setReply("");
      setPendingAttachments([]);
      await loadTicket();
      toast.success("Reply sent");
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const submitCsat = async () => {
    if (!id || !csatScore) return;
    setSubmittingCsat(true);
    try {
      await fetcher.post(`/api/me/support-tickets/${id}/csat`, {
        score: csatScore,
        comment: csatComment.trim() || null,
      });
      await loadTicket();
      toast.success("Thanks for rating support");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSubmittingCsat(false);
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
              {ticket.category ? (
                <p className="text-sm text-zinc-600">
                  Category:{" "}
                  <span className="font-medium text-zinc-800">
                    {labelForSupportTicketCategory(ticket.category)}
                  </span>
                </p>
              ) : null}
              {ticket.support_context_type ? (
                <p className="text-sm text-zinc-600">
                  About:{" "}
                  <span className="font-medium text-zinc-800">
                    {ticket.support_context_type.replace(/_/g, " ")}
                  </span>
                  {ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}
                </p>
              ) : null}
              <p className="text-sm text-gray-500">
                Created {new Date(ticket.created_at).toLocaleString()}
              </p>
            </CardHeader>
          </Card>

          <div className="space-y-3 mb-8">
            {messages.map((m) => {
              const isOwn = m.is_mine === true;
              const authorLabel = m.author_name ?? (isOwn ? "You" : "Support Team");
              const attachments = Array.isArray(m.attachments) ? m.attachments : [];
              return (
                <div
                  key={m.id}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                      isOwn
                        ? "bg-[#FF0077] text-white rounded-br-sm"
                        : "border border-blue-100 bg-blue-50 text-gray-900 rounded-bl-sm"
                    }`}
                  >
                    <p className={`mb-1 flex items-center gap-2 text-xs font-semibold ${isOwn ? "text-pink-100" : "text-blue-700"}`}>
                      <span>{authorLabel}</span>
                      {!isOwn ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-blue-700">Support team</span> : null}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
                    {attachments.length > 0 ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {attachments.map((attachment, index) => (
                          <a
                            key={`${m.id}-attachment-${index}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`overflow-hidden rounded-xl border text-xs ${
                              isOwn ? "border-white/25 bg-white/10 text-white" : "border-blue-100 bg-white text-gray-800"
                            }`}
                          >
                            {isImageAttachment(attachment) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={attachment.url} alt={attachment.name || "Attachment"} className="h-28 w-full object-cover" />
                            ) : (
                              <span className="flex h-16 items-center justify-center">
                                <FileText className="h-6 w-6 opacity-70" />
                              </span>
                            )}
                            <span className="flex items-center gap-2 px-2 py-2">
                              {isImageAttachment(attachment) ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                              <span className="min-w-0 flex-1 truncate">{attachment.name || `Attachment ${index + 1}`}</span>
                              {attachment.size != null ? <span className="shrink-0 opacity-70">{fileSizeLabel(attachment.size)}</span> : null}
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <p className={`text-xs mt-1.5 ${isOwn ? "text-pink-200" : "text-gray-400"}`}>
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
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
                  <div className="space-y-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-zinc-600">
                        <p className="font-medium text-zinc-800">Attachments</p>
                        <p className="text-xs">Screenshots help support diagnose issues faster.</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => void uploadFiles(e.target.files)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploadingAttachment || sending}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploadingAttachment ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Paperclip className="h-4 w-4 mr-2" />
                        )}
                        Attach files
                      </Button>
                    </div>
                    {pendingAttachments.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {pendingAttachments.map((attachment, index) => (
                          <div key={`${attachment.url}-${index}`} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                            <span className="min-w-0 flex-1 truncate">{attachment.name || `Attachment ${index + 1}`}</span>
                            <button
                              type="button"
                              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                              onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== index))}
                              aria-label={`Remove ${attachment.name || "attachment"}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    disabled={sending || (!reply.trim() && pendingAttachments.length === 0)}
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
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rate this support experience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setCsatScore(score)}
                        className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${
                          csatScore === score
                            ? "border-[#FF0077] bg-[#FF0077] text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={csatComment}
                    onChange={(e) => setCsatComment(e.target.value)}
                    placeholder="Optional: what went well or what could be better?"
                    rows={3}
                    maxLength={1000}
                  />
                  <Button
                    type="button"
                    onClick={submitCsat}
                    disabled={!csatScore || submittingCsat}
                    className="bg-[#FF0077] hover:bg-[#D60565]"
                  >
                    {submittingCsat ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {ticket.csat_score ? "Update rating" : "Submit rating"}
                  </Button>
                </CardContent>
              </Card>
              <p className="text-sm text-gray-500">
                This ticket is {ticket.status}. To continue the conversation,{" "}
                <Link href="/help/submit-ticket" className="text-[#FF0077] underline">
                  submit a new ticket
                </Link>
                .
              </p>
            </div>
          )}
        </div>
        <Footer />
        <BottomNav />
      </div>
    </AuthGuard>
  );
}

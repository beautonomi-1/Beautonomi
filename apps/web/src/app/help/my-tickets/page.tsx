"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageSquare, Plus } from "lucide-react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { labelForSupportTicketCategory } from "@/lib/support/ticket-categories";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  support_context_type?: string | null;
  support_context_label?: string | null;
  csat_score?: number | null;
  has_unread_staff_reply?: boolean;
  last_message_from?: "customer" | "staff" | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
};

const SUPPORT_CONTEXT_LABELS: Record<string, string> = {
  booking: "Booking",
  product_order: "Product order",
  gift_card: "Gift card",
  payment: "Payment",
  provider_onboarding: "Provider onboarding",
  account: "Account",
  technical: "Technical",
  other: "Other",
};

function contextLabel(ticket: Ticket): string | null {
  if (!ticket.support_context_type) return ticket.support_context_label || null;
  const base = SUPPORT_CONTEXT_LABELS[ticket.support_context_type] ?? ticket.support_context_type.replaceAll("_", " ");
  return ticket.support_context_label ? `${base}: ${ticket.support_context_label}` : base;
}

function shouldAskForCsat(ticket: Ticket): boolean {
  return (
    (ticket.status === "resolved" || ticket.status === "closed") &&
    typeof ticket.csat_score !== "number"
  );
}

export default function MyTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetcher.get<{ data?: { tickets?: Ticket[] } }>("/api/me/support-tickets", {
          staleTimeMs: 0,
        });
        const data = (res as { data?: { tickets?: Ticket[] } })?.data;
        setTickets(data?.tickets ?? []);
      } catch {
        setTickets([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
            <LoadingTimeout loadingMessage="Loading your tickets..." />
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Button variant="ghost" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Help Center
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My support tickets</h1>
              <p className="text-sm text-gray-500 mt-1">View and reply to your support requests</p>
            </div>
            <Button asChild className="bg-[#FF0077] hover:bg-[#D60565]">
              <Link href="/help/submit-ticket">
                <Plus className="h-4 w-4 mr-2" />
                New ticket
              </Link>
            </Button>
          </div>

          {tickets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">You haven&apos;t submitted any support tickets yet.</p>
                <Button asChild variant="outline">
                  <Link href="/help/submit-ticket">Submit a ticket</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/help/my-tickets/${t.id}`}>
                    <Card className="rounded-2xl border-zinc-200/90 transition-colors hover:border-[#FF0077]/20 hover:bg-zinc-50/80">
                      <CardHeader className="py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-sm text-gray-500">{t.ticket_number}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            {t.has_unread_staff_reply || t.last_message_from === "staff" ? (
                              <Badge className="bg-blue-100 text-blue-800">Support replied</Badge>
                            ) : null}
                            <Badge className={statusColor(t.status)}>{t.status.replace("_", " ")}</Badge>
                          </div>
                        </div>
                        <CardTitle className="text-base mt-1">{t.subject}</CardTitle>
                        <CardDescription className="space-y-1">
                          {contextLabel(t) ? (
                            <span className="block text-zinc-700">
                              About {contextLabel(t)}
                            </span>
                          ) : null}
                          {t.category ? (
                            <span className="block text-zinc-600">
                              {labelForSupportTicketCategory(t.category)}
                            </span>
                          ) : null}
                          {shouldAskForCsat(t) ? (
                            <span className="block font-medium text-[#FF0077]">
                              Rate this support experience
                            </span>
                          ) : typeof t.csat_score === "number" ? (
                            <span className="block text-zinc-600">Your rating: {t.csat_score}/5</span>
                          ) : null}
                          <span className="block">
                            Updated {new Date(t.updated_at).toLocaleDateString()}
                          </span>
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Footer />
        <BottomNav />
      </div>
    </AuthGuard>
  );
}

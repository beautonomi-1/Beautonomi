"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { ChevronRight, LifeBuoy, Plus } from "lucide-react";
import { labelForSupportTicketCategory } from "@/lib/support/ticket-categories";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  has_unread_staff_reply?: boolean;
  created_at: string;
  updated_at: string;
};

export default function ProviderSupportTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetcher.get<{ data: { tickets?: Ticket[] } }>(
        "/api/provider/support-tickets",
      );
      setTickets(res.data?.tickets ?? []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Support tickets"
        subtitle="All tickets, replies & status"
        breadcrumbs={[
          { label: "More", href: "/provider/more" },
          { label: "Support tickets" },
        ]}
        actions={
          <Button asChild>
            <Link href="/provider/support-tickets/new">
              <Plus className="h-4 w-4 mr-2" />
              New ticket
            </Link>
          </Button>
        }
      />

      {loading ? (
        <LoadingTimeout loadingMessage="Loading tickets…" />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets"
          description="Need help? Contact our support team."
          action={{
            label: "Contact support",
            onClick: () => router.push("/provider/support-tickets/new"),
          }}
        />
      ) : (
        <ul className="mt-6 space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/provider/support-tickets/${ticket.id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{ticket.subject}</span>
                    {ticket.has_unread_staff_reply ? (
                      <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        New reply
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    #{ticket.ticket_number} · {ticket.status.replace(/_/g, " ")}
                    {ticket.category
                      ? ` · ${labelForSupportTicketCategory(ticket.category)}`
                      : ""}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

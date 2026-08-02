"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  SUPPORT_TICKET_CATEGORY_GROUPS,
} from "@/lib/support/ticket-categories";

const DEFAULT_CATEGORY =
  SUPPORT_TICKET_CATEGORY_GROUPS[0]?.items[0]?.value ?? "account_sign_in";

export default function ProviderNewSupportTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Enter a subject and message");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetcher.post<{ data?: { ticket?: { id?: string; ticket_number?: string } } }>(
        "/api/provider/support-tickets",
        {
          subject: subject.trim(),
          message: message.trim(),
          priority,
          category,
        },
      );
      const id = res.data?.ticket?.id;
      const num = res.data?.ticket?.ticket_number;
      toast.success(num ? `Ticket ${num} submitted` : "Ticket submitted");
      router.push(id ? `/provider/support-tickets/${id}` : "/provider/support-tickets");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Contact support"
        subtitle="Submit a support ticket or get help"
        breadcrumbs={[
          { label: "More", href: "/provider/more" },
          { label: "Support tickets", href: "/provider/support-tickets" },
          { label: "New ticket" },
        ]}
      />

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 max-w-xl space-y-4">
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {SUPPORT_TICKET_CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={5000}
          />
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit ticket"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/provider/support-tickets">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

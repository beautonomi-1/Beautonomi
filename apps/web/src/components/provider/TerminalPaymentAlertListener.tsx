"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";

type MatchCandidate = {
  entity_type: string;
  entity_id: string;
  label: string | null;
  reference: string | null;
  expected_amount: number;
  confidence: number;
};

type TerminalPayment = {
  id: string;
  paystack_reference: string;
  paid_amount: number;
  currency: string;
  payer_name: string | null;
  customer_reference: string | null;
  allocation_status: string;
  amount_match_status: string;
  suggested_entity_type: string | null;
  suggested_entity_id: string | null;
  match_candidates?: MatchCandidate[] | null;
};

const TERMINAL_INBOX_URL = "/provider/settings/sales/paystack-terminal";

/**
 * Global listener that opens an instant "payment received" dialog when a Paystack Virtual
 * Terminal payment arrives. It listens to the durable `notifications` row inserted by the
 * webhook (so it works with RLS using the current user id) and then loads the full payment
 * to render the pre-selected suggestion + one-tap allocate.
 */
export function TerminalPaymentAlertListener() {
  const { user } = useAuth();
  const router = useRouter();
  const [payment, setPayment] = useState<TerminalPayment | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());

  const loadPayment = useCallback(async (paymentId: string) => {
    try {
      const res = await fetcher.get<{ data?: { items?: TerminalPayment[] } }>(
        "/api/provider/paystack/terminal-payments?limit=50",
      );
      const found = (res.data?.items ?? []).find((item) => item.id === paymentId);
      if (found) setPayment(found);
    } catch {
      /* non-fatal: the bell + inbox still reflect it */
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`terminal-payments:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as { data?: Record<string, unknown> };
            const data = row?.data ?? {};
            if (data?.type === "paystack_terminal_payment" && typeof data.terminal_payment_id === "string") {
              const paymentId = data.terminal_payment_id;
              setSeen((prev) => {
                if (prev.has(paymentId)) return prev;
                const next = new Set(prev);
                next.add(paymentId);
                void loadPayment(paymentId);
                return next;
              });
            }
          },
        )
        .subscribe();
    } catch {
      /* realtime unavailable — bell/inbox remain the fallback */
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, loadPayment]);

  const topCandidate =
    payment?.match_candidates && payment.match_candidates.length > 0
      ? payment.match_candidates[0]
      : payment?.suggested_entity_type && payment?.suggested_entity_id
        ? {
            entity_type: payment.suggested_entity_type,
            entity_id: payment.suggested_entity_id,
            label: null,
            reference: null,
            expected_amount: payment.paid_amount,
            confidence: 0,
          }
        : null;

  const handleAllocate = useCallback(async () => {
    if (!payment || !topCandidate) return;
    setAllocating(true);
    try {
      await fetcher.post(`/api/provider/paystack/terminal-payments/${payment.id}/allocation`, {
        action: "confirm",
        entity_type: topCandidate.entity_type,
        entity_id: topCandidate.entity_id,
      });
      toast.success("Payment allocated");
      setPayment(null);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Could not allocate payment.");
    } finally {
      setAllocating(false);
    }
  }, [payment, topCandidate]);

  if (!payment) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && setPayment(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payment received</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-3xl font-bold text-emerald-950">
              {payment.currency} {Number(payment.paid_amount).toFixed(2)}
            </p>
            {payment.payer_name && (
              <p className="mt-1 text-sm text-emerald-800">From {payment.payer_name}</p>
            )}
            {payment.customer_reference && (
              <p className="mt-1 text-xs text-emerald-700">
                Reference: <span className="font-mono">{payment.customer_reference}</span>
              </p>
            )}
          </div>

          {topCandidate ? (
            <div className="rounded-lg border border-gray-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Suggested allocation
              </p>
              <p className="mt-1 font-medium text-gray-900">
                {topCandidate.label || `${topCandidate.entity_type} ${topCandidate.entity_id.slice(0, 8)}`}
              </p>
              {topCandidate.expected_amount > 0 && (
                <p className="text-xs text-gray-500">
                  Expected {payment.currency} {Number(topCandidate.expected_amount).toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              No automatic match found. Open the inbox to assign this payment.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {topCandidate && (
              <Button type="button" className="flex-1" disabled={allocating} onClick={handleAllocate}>
                {allocating ? "Allocating…" : "Confirm & allocate"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setPayment(null);
                router.push(`${TERMINAL_INBOX_URL}?payment=${payment.id}`);
              }}
            >
              {topCandidate ? "Assign to something else" : "Open inbox"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setPayment(null)}
            >
              Save for later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

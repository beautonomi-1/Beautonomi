"use client";

import React, { useEffect, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type RequestItem = {
  id: string;
  description: string;
  status: string;
  created_at: string;
  preferred_start_at?: string | null;
  duration_minutes?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  location_type?: string;
  customer?: { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null };
  offers?: Array<{ id: string; status: string; price: number; currency: string; created_at: string }>;
  attachments?: Array<{ id: string; url: string }>;
};

export default function ProviderCustomRequestsPage() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);

  const [price, setPrice] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [expirationAt, setExpirationAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetcher.get<{ data: RequestItem[] }>("/api/provider/custom-requests");
      setItems(res.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load custom requests";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openOffer = (req: RequestItem) => {
    setSelected(req);
    setOfferOpen(true);
    setPrice("");
    setDurationMinutes(Number(req.duration_minutes || 60));
    const exp = new Date();
    exp.setDate(exp.getDate() + 2);
    setExpirationAt(exp.toISOString().slice(0, 16));
    setNotes("");
  };

  const sendOffer = async () => {
    if (!selected) return;
    try {
      setIsSubmitting(true);
      await fetcher.post(`/api/provider/custom-requests/${selected.id}/offers`, {
        price: Number(price || 0),
        currency: "ZAR",
        duration_minutes: Number(durationMinutes || 60),
        expiration_at: expirationAt,
        notes: notes || null,
      });
      toast.success("Offer sent");
      setOfferOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2">Custom Requests</h1>
          <p className="text-gray-600">Respond with tailored offers and convert them into bookings.</p>
        </div>

        {isLoading ? (
          <LoadingTimeout loadingMessage="Loading custom requests..." />
        ) : error ? (
          <EmptyState title="Failed to load" description={error} action={{ label: "Retry", onClick: load }} />
        ) : items.length === 0 ? (
          <EmptyState title="No custom requests yet" description="Customer custom requests will appear here." />
        ) : (
          <div className="space-y-4">
            {items.map((r) => (
              <div key={r.id} className="bg-white border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-600">
                      {r.customer?.full_name || r.customer?.email || "Customer"} •{" "}
                      <span className="capitalize">{r.status}</span>
                    </div>
                    <div className="font-medium mt-1 break-words">{r.description}</div>
                    <div className="text-sm text-gray-600 mt-2">
                      {r.preferred_start_at ? `Preferred: ${new Date(r.preferred_start_at).toLocaleString()}` : "Preferred: not set"} •{" "}
                      {r.location_type || "at_salon"}
                      {r.budget_min != null || r.budget_max != null ? ` • Budget: ${r.budget_min ?? ""} - ${r.budget_max ?? ""}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" onClick={() => openOffer(r)}>
                      Send Offer
                    </Button>
                  </div>
                </div>
                {r.offers && r.offers.length > 0 ? (
                  <div className="mt-3 text-sm text-gray-600">
                    Offers:{" "}
                    {r.offers.map((o) => `${o.currency} ${o.price} (${o.status})`).join(" • ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Send Custom Offer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Price (ZAR)</Label>
                <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input type="number" min={15} step={15} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Expiration</Label>
                  <Input type="datetime-local" value={expirationAt} onChange={(e) => setExpirationAt(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOfferOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={sendOffer} disabled={isSubmitting || !price}>
                  {isSubmitting ? "Sending..." : "Send Offer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}


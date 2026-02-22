"use client";

import React, { useEffect, useState } from "react";
import AuthGuard from "@/components/auth/auth-guard";
import BackButton from "../components/back-button";
import Breadcrumb from "../components/breadcrumb";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

type Offer = {
  id: string;
  price: number;
  currency: string;
  duration_minutes: number;
  expiration_at: string;
  notes?: string | null;
  status: string;
  payment_url?: string | null;
  paid_at?: string | null;
};

type CustomRequest = {
  id: string;
  description: string;
  status: string;
  preferred_start_at?: string | null;
  location_type: string;
  budget_min?: number | null;
  budget_max?: number | null;
  created_at: string;
  provider?: { business_name?: string | null; slug?: string | null } | null;
  customer?: { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
  offers?: Offer[];
};

type Client = {
  id: string;
  customer_id: string;
  customer?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function CustomRequestsPage() {
  const { role } = useAuth();
  const isProvider = role === "provider_owner" || role === "provider_staff";
  
  const [items, setItems] = useState<CustomRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state for creating new custom offer
  const [formData, setFormData] = useState({
    customer_id: "",
    description: "",
    location_type: "at_salon" as "at_home" | "at_salon",
    price: "",
    currency: "ZAR",
    duration_minutes: "60",
    expiration_days: "7",
    notes: "",
    preferred_start_at: "",
  });

  // Form state for creating offer for existing request
  const [offerFormData, setOfferFormData] = useState({
    price: "",
    currency: "ZAR",
    duration_minutes: "60",
    expiration_days: "7",
    notes: "",
  });

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const endpoint = isProvider ? "/api/provider/custom-requests" : "/api/me/custom-requests";
      const res = await fetcher.get<{ data: CustomRequest[] }>(endpoint, { cache: "no-store" });
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

  const loadClients = async () => {
    if (!isProvider) return;
    try {
      setIsLoadingClients(true);
      const res = await fetcher.get<{ data: Client[] }>("/api/provider/clients", { cache: "no-store" });
      setClients(res.data || []);
    } catch (err) {
      console.error("Failed to load clients:", err);
      toast.error("Failed to load clients");
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    load();
    if (isProvider) {
      loadClients();
    }
  }, [isProvider]); // eslint-disable-line react-hooks/exhaustive-deps -- load when isProvider changes

  const acceptAndPay = async (offerId: string) => {
    try {
      const res = await fetcher.post<{ data: { paymentUrl: string } }>(`/api/me/custom-offers/${offerId}/accept`, {});
      const url = res.data.paymentUrl;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("No payment URL returned");
    } catch (e: any) {
      toast.error(e?.message || "Failed to start payment");
    }
  };

  const handleCreateOffer = async () => {
    if (!formData.customer_id || !formData.description || !formData.price) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSubmitting(true);
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + parseInt(formData.expiration_days));

      const payload = {
        customer_id: formData.customer_id,
        description: formData.description,
        location_type: formData.location_type,
        price: parseFloat(formData.price),
        currency: formData.currency,
        duration_minutes: parseInt(formData.duration_minutes),
        expiration_at: expirationDate.toISOString(),
        notes: formData.notes || null,
        preferred_start_at: formData.preferred_start_at || null,
      };

      await fetcher.post("/api/provider/custom-offers/create", payload);
      toast.success("Custom offer sent successfully!");
      setShowCreateModal(false);
      setFormData({
        customer_id: "",
        description: "",
        location_type: "at_salon",
        price: "",
        currency: "ZAR",
        duration_minutes: "60",
        expiration_days: "7",
        notes: "",
        preferred_start_at: "",
      });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create custom offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openOfferModal = (requestId: string) => {
    setSelectedRequestId(requestId);
    setOfferFormData({
      price: "",
      currency: "ZAR",
      duration_minutes: "60",
      expiration_days: "7",
      notes: "",
    });
    setShowOfferModal(true);
  };

  const handleCreateOfferForRequest = async () => {
    if (!selectedRequestId || !offerFormData.price) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsSubmitting(true);
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + parseInt(offerFormData.expiration_days));

      const payload = {
        price: parseFloat(offerFormData.price),
        currency: offerFormData.currency,
        duration_minutes: parseInt(offerFormData.duration_minutes),
        expiration_at: expirationDate.toISOString(),
        notes: offerFormData.notes || null,
      };

      await fetcher.post(`/api/provider/custom-requests/${selectedRequestId}/offers`, payload);
      toast.success("Offer created successfully!");
      setShowOfferModal(false);
      setSelectedRequestId(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create offer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="w-full max-w-[950px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
        <BackButton href="/account-settings" />
        <Breadcrumb items={[{ label: "Account", href: "/account-settings" }, { label: "Custom Requests" }]} />

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Custom Requests</h1>
          {isProvider && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Custom Offer
            </Button>
          )}
        </div>

        {isProvider && (
          <p className="text-sm text-gray-600 mb-6">
            Respond with tailored offers and convert them into bookings.
          </p>
        )}

        {isLoading ? (
          <LoadingTimeout loadingMessage="Loading custom requests..." />
        ) : error ? (
          <EmptyState
            title="Failed to load"
            description={error}
            action={{ label: "Retry", onClick: load }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={isProvider ? "No custom requests yet" : "No custom requests yet"}
            description={
              isProvider
                ? "Customer custom requests will appear here."
                : "Request a custom service from a provider to receive a tailored offer."
            }
          />
        ) : (
          <div className="space-y-4">
            {items.map((r) => (
              <div key={r.id} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-gray-600">
                      {isProvider ? (
                        <>
                          {r.customer?.full_name || r.customer?.email || "Customer"} •{" "}
                          <span className="capitalize">{r.status}</span>
                        </>
                      ) : (
                        <>
                          {r.provider?.business_name ? r.provider.business_name : "Provider"} •{" "}
                          <span className="capitalize">{r.status}</span>
                        </>
                      )}
                    </div>
                    <div className="font-medium mt-1">{r.description}</div>
                    <div className="text-sm text-gray-600 mt-2">
                      {r.preferred_start_at ? `Preferred: ${new Date(r.preferred_start_at).toLocaleString()}` : "Preferred: not set"} •{" "}
                      {r.location_type}
                      {r.budget_min != null || r.budget_max != null
                        ? ` • Budget: ${r.budget_min ?? ""} - ${r.budget_max ?? ""}`
                        : ""}
                    </div>
                  </div>
                  {isProvider && r.status === "pending" && (!r.offers || r.offers.length === 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openOfferModal(r.id)}
                    >
                      Create Offer
                    </Button>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {r.offers && r.offers.length > 0 ? (
                    r.offers.map((o) => (
                      <div key={o.id} className="border rounded-md p-3 flex items-center justify-between gap-4">
                        <div>
                          <div className="font-medium">
                            Offer: {o.currency} {o.price} • {o.duration_minutes} mins
                          </div>
                          <div className="text-sm text-gray-600">
                            Expires: {new Date(o.expiration_at).toLocaleString()} • <span className="capitalize">{o.status}</span>
                          </div>
                          {o.notes ? <div className="text-sm mt-1">{o.notes}</div> : null}
                        </div>
                        {!isProvider && (
                          <div className="flex gap-2">
                            {o.status === "paid" ? (
                              <Button variant="secondary" disabled>
                                Paid
                              </Button>
                            ) : (
                              <Button onClick={() => acceptAndPay(o.id)}>Accept & Pay</Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-600">
                      {isProvider ? "No offers sent yet." : "No offers yet."}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Custom Offer Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Create Custom Offer</DialogTitle>
              <DialogDescription>
                Send a tailored service offer to a client. They can review and accept it to create a booking.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="customer">Client *</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingClients ? (
                      <SelectItem value="loading" disabled>Loading clients...</SelectItem>
                    ) : clients.length === 0 ? (
                      <SelectItem value="none" disabled>No clients found</SelectItem>
                    ) : (
                      clients.map((client) => (
                        <SelectItem key={client.customer_id} value={client.customer_id}>
                          {client.customer?.full_name || client.customer?.email || "Unknown"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Service Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the custom service you're offering..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  maxLength={4000}
                />
                <p className="text-xs text-gray-500 mt-1">{formData.description.length}/4000 characters</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location_type">Location Type</Label>
                  <Select
                    value={formData.location_type}
                    onValueChange={(value: "at_home" | "at_salon") =>
                      setFormData({ ...formData, location_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="at_salon">At Salon</SelectItem>
                      <SelectItem value="at_home">At Home</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="duration_minutes">Duration (minutes) *</Label>
                  <Input
                    id="duration_minutes"
                    type="number"
                    min="15"
                    max="480"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expiration_days">Offer Expires In (days)</Label>
                  <Input
                    id="expiration_days"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.expiration_days}
                    onChange={(e) => setFormData({ ...formData, expiration_days: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="preferred_start_at">Preferred Start Date (optional)</Label>
                  <Input
                    id="preferred_start_at"
                    type="datetime-local"
                    value={formData.preferred_start_at}
                    onChange={(e) => setFormData({ ...formData, preferred_start_at: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Additional Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional information about this offer..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOffer} disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send Offer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Offer for Existing Request Modal */}
        <Dialog open={showOfferModal} onOpenChange={setShowOfferModal}>
          <DialogContent className="max-w-[95vw] sm:max-w-xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Create Offer</DialogTitle>
              <DialogDescription>
                Create a custom offer for this request. The customer will be notified and can accept it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_price">Price *</Label>
                  <Input
                    id="offer_price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={offerFormData.price}
                    onChange={(e) => setOfferFormData({ ...offerFormData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="offer_currency">Currency</Label>
                  <Select
                    value={offerFormData.currency}
                    onValueChange={(value) => setOfferFormData({ ...offerFormData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZAR">ZAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="offer_duration_minutes">Duration (minutes) *</Label>
                  <Input
                    id="offer_duration_minutes"
                    type="number"
                    min="15"
                    max="480"
                    value={offerFormData.duration_minutes}
                    onChange={(e) => setOfferFormData({ ...offerFormData, duration_minutes: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="offer_expiration_days">Offer Expires In (days)</Label>
                  <Input
                    id="offer_expiration_days"
                    type="number"
                    min="1"
                    max="30"
                    value={offerFormData.expiration_days}
                    onChange={(e) => setOfferFormData({ ...offerFormData, expiration_days: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="offer_notes">Additional Notes (optional)</Label>
                <Textarea
                  id="offer_notes"
                  placeholder="Add any additional information about this offer..."
                  value={offerFormData.notes}
                  onChange={(e) => setOfferFormData({ ...offerFormData, notes: e.target.value })}
                  rows={3}
                  maxLength={4000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowOfferModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOfferForRequest} disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Offer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}


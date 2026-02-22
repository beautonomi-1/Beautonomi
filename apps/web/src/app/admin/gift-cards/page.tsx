"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Search, Gift, Eye, Copy } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GiftCard {
  id: string;
  code: string;
  currency: string;
  initial_balance: number;
  balance: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  metadata?: any;
}

export default function AdminGiftCards() {
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingCard, setViewingCard] = useState<GiftCard | null>(null);
  const [editingCard, setEditingCard] = useState<GiftCard | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    code: "",
    initial_balance: "",
    currency: "ZAR",
    expires_at: "",
    metadata: "{}",
  });

  useEffect(() => {
    loadGiftCards();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const loadGiftCards = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetcher.get<{
        gift_cards: GiftCard[];
        meta: { total: number; page: number; limit: number; has_more: boolean };
      }>(`/api/admin/gift-cards?${params.toString()}`);
      setGiftCards(response.gift_cards || []);
    } catch (error) {
      console.error("Failed to load gift cards:", error);
      toast.error("Failed to load gift cards");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCard(null);
    setFormData({
      code: "",
      initial_balance: "",
      currency: "ZAR",
      expires_at: "",
      metadata: "{}",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (card: GiftCard) => {
    setEditingCard(card);
    setFormData({
      code: card.code,
      initial_balance: card.balance.toString(),
      currency: card.currency,
      expires_at: card.expires_at ? new Date(card.expires_at).toISOString().split("T")[0] : "",
      metadata: JSON.stringify(card.metadata || {}, null, 2),
    });
    setIsDialogOpen(true);
  };

  const handleView = async (card: GiftCard) => {
    try {
      const response = await fetcher.get<{ gift_card: GiftCard & { redemptions?: any[] } }>(
        `/api/admin/gift-cards/${card.id}`
      );
      setViewingCard(response.gift_card);
      setIsViewDialogOpen(true);
    } catch (error) {
      console.error("Failed to load gift card details:", error);
      toast.error("Failed to load gift card details");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this gift card?")) return;

    try {
      await fetcher.delete(`/api/admin/gift-cards/${id}`);
      toast.success("Gift card deleted successfully");
      loadGiftCards();
    } catch (error) {
      console.error("Failed to delete gift card:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to delete gift card");
    }
  };

  const handleSave = async () => {
    try {
      let metadataObj = {};
      try {
        metadataObj = JSON.parse(formData.metadata);
      } catch {
        toast.error("Invalid JSON in metadata field");
        return;
      }

      if (editingCard) {
        await fetcher.patch(`/api/admin/gift-cards/${editingCard.id}`, {
          balance: parseFloat(formData.initial_balance),
          expires_at: formData.expires_at || null,
          metadata: metadataObj,
        });
        toast.success("Gift card updated successfully");
      } else {
        if (!formData.code || !formData.initial_balance) {
          toast.error("Code and initial balance are required");
          return;
        }
        await fetcher.post("/api/admin/gift-cards", {
          code: formData.code,
          initial_balance: parseFloat(formData.initial_balance),
          currency: formData.currency,
          expires_at: formData.expires_at || null,
          metadata: metadataObj,
        });
        toast.success("Gift card created successfully");
      }
      setIsDialogOpen(false);
      loadGiftCards();
    } catch (error) {
      console.error("Failed to save gift card:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save gift card");
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Gift card code copied to clipboard");
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "ZAR",
    }).format(amount);
  };

  const getStatusBadge = (card: GiftCard) => {
    if (!card.is_active) {
      return <Badge variant="outline">Inactive</Badge>;
    }
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return <Badge className="bg-red-100 text-red-800">Expired</Badge>;
    }
    if (card.balance === 0) {
      return <Badge className="bg-gray-100 text-gray-800">Zero Balance</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading gift cards..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Gift Cards Management</h1>
            <p className="text-gray-600 mt-1">Manage gift cards and view redemption history</p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Create Gift Card
          </Button>
        </div>

        <div className="mb-6 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by code or recipient email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  loadGiftCards();
                }
              }}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="zero_balance">Zero Balance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {giftCards.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No gift cards found"
            description="Create your first gift card to get started"
            action={{
              label: "Create Gift Card",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Initial Balance</TableHead>
                  <TableHead>Current Balance</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {giftCards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-mono font-medium">
                      <div className="flex items-center gap-2">
                        {card.code}
                        <button
                          onClick={() => handleCopyCode(card.code)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(card.initial_balance, card.currency)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          card.balance === 0 ? "text-gray-500" : "font-semibold"
                        }
                      >
                        {formatCurrency(card.balance, card.currency)}
                      </span>
                    </TableCell>
                    <TableCell>{card.currency}</TableCell>
                    <TableCell>{getStatusBadge(card)}</TableCell>
                    <TableCell>
                      {card.expires_at
                        ? new Date(card.expires_at).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      {new Date(card.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(card)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(card)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(card.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCard ? "Edit Gift Card" : "Create Gift Card"}
              </DialogTitle>
              <DialogDescription>
                {editingCard
                  ? "Update gift card details"
                  : "Create a new gift card with a unique code"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="code">Gift Card Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="GIFT123456"
                  disabled={!!editingCard}
                  required
                />
                {!editingCard && (
                  <p className="text-xs text-gray-500 mt-1">
                    Code will be converted to uppercase
                  </p>
                )}
              </div>

              {!editingCard && (
                <div>
                  <Label htmlFor="initial_balance">Initial Balance *</Label>
                  <Input
                    id="initial_balance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.initial_balance}
                    onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                    placeholder="500.00"
                    required
                  />
                </div>
              )}

              {editingCard && (
                <div>
                  <Label htmlFor="balance">Current Balance *</Label>
                  <Input
                    id="balance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.initial_balance}
                    onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                    placeholder="500.00"
                    required
                  />
                </div>
              )}

              {!editingCard && (
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(v) => setFormData({ ...formData, currency: v })}
                  >
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                      <SelectItem value="USD">USD (US Dollar)</SelectItem>
                      <SelectItem value="EUR">EUR (Euro)</SelectItem>
                      <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="expires_at">Expiration Date (Optional)</Label>
                <Input
                  id="expires_at"
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty for gift cards that never expire
                </p>
              </div>

              <div>
                <Label htmlFor="metadata">Metadata (JSON)</Label>
                <textarea
                  id="metadata"
                  value={formData.metadata}
                  onChange={(e) => setFormData({ ...formData, metadata: e.target.value })}
                  rows={4}
                  className="w-full p-2 border rounded-md font-mono text-sm"
                  placeholder='{"recipient_email": "user@example.com"}'
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {editingCard ? "Update" : "Create"} Gift Card
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Details Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Gift Card Details: {viewingCard?.code}</DialogTitle>
              <DialogDescription>View gift card information and redemption history</DialogDescription>
            </DialogHeader>

            {viewingCard && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Code</Label>
                    <p className="text-sm font-mono font-medium">{viewingCard.code}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Currency</Label>
                    <p className="text-sm">{viewingCard.currency}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Initial Balance</Label>
                    <p className="text-sm font-semibold">
                      {formatCurrency(viewingCard.initial_balance, viewingCard.currency)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Current Balance</Label>
                    <p className="text-sm font-semibold">
                      {formatCurrency(viewingCard.balance, viewingCard.currency)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Status</Label>
                    <div className="mt-1">{getStatusBadge(viewingCard)}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Expires</Label>
                    <p className="text-sm">
                      {viewingCard.expires_at
                        ? new Date(viewingCard.expires_at).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                </div>

                {(viewingCard as any).redemptions &&
                  (viewingCard as any).redemptions.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium text-gray-500 mb-2 block">
                        Redemption History
                      </Label>
                      <div className="space-y-2">
                        {(viewingCard as any).redemptions.map((redemption: any) => (
                          <div
                            key={redemption.id}
                            className="flex items-center justify-between p-3 border rounded"
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {formatCurrency(redemption.amount, viewingCard.currency)}
                              </p>
                              <p className="text-xs text-gray-500">
                                Booking: {redemption.booking_id?.substring(0, 8)}...
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                className={
                                  redemption.status === "captured"
                                    ? "bg-green-100 text-green-800"
                                    : redemption.status === "voided"
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }
                              >
                                {redemption.status}
                              </Badge>
                              <p className="text-xs text-gray-500">
                                {new Date(redemption.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

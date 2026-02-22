"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  MapPin,
  Edit,
  Save,
  X,
  ArrowLeft,
  XCircle,
  RotateCcw,
  Mail,
  Phone,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { format } from "date-fns";

interface BookingService {
  id: string;
  service_id: string;
  duration_minutes: number;
  price: number;
  services: {
    id: string;
    title: string;
    name: string;
  };
}

interface BookingProduct {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products: {
    id: string;
    name: string;
    retail_price: number;
  };
}

interface Booking {
  id: string;
  booking_number: string;
  customer_id: string;
  provider_id: string;
  status: string;
  scheduled_at: string;
  location_type: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  country?: string;
  total_amount: number;
  currency: string;
  notes?: string;
  customer: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string;
  };
  provider: {
    id: string;
    business_name: string;
    slug: string;
    email: string;
    phone: string;
  };
  location?: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    country: string;
  };
  booking_services?: BookingService[];
  booking_products?: BookingProduct[];
  payment_transaction?: any;
  created_at: string;
  updated_at: string;
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Booking>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState("");

  useEffect(() => {
    if (bookingId) {
      loadBooking();
    }
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps -- load when bookingId changes

  const loadBooking = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: Booking }>(
        `/api/admin/bookings/${bookingId}`
      );
      setBooking(response.data);
      setEditData(response.data);
      if (response.data.total_amount) {
        setRefundAmount(response.data.total_amount);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load booking";
      setError(errorMessage);
      console.error("Error loading booking:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!booking) return;

    try {
      setIsSaving(true);

      await fetcher.patch(`/api/admin/bookings/${bookingId}`, editData);
      
      toast.success("Booking updated successfully");
      setIsEditing(false);
      loadBooking();
    } catch (error: any) {
      toast.error(error.message || "Failed to update booking");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;

    try {
      await fetcher.post(`/api/admin/bookings/${bookingId}/cancel`, {
        reason: cancelReason || undefined,
      });

      toast.success("Booking cancelled successfully");
      setShowCancelDialog(false);
      setCancelReason("");
      loadBooking();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel booking");
    }
  };

  const handleRefund = async () => {
    if (!booking) return;

    try {
      await fetcher.post(`/api/admin/bookings/${bookingId}/refund`, {
        amount: refundAmount,
        reason: refundReason || undefined,
      });

      toast.success("Refund processed successfully");
      setShowRefundDialog(false);
      setRefundReason("");
      loadBooking();
    } catch (error: any) {
      toast.error(error.message || "Failed to process refund");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
      case "booked":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
      case "started":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-purple-100 text-purple-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "no_show":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading booking details..." />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <EmptyState
            title="Failed to load booking"
            description={error || "Booking not found"}
            action={{
              label: "Back to Bookings",
              onClick: () => router.push("/admin/bookings"),
            }}
          />
        </div>
      </div>
    );
  }

  const subtotal = booking.booking_services?.reduce((sum, s) => sum + (s.price || 0), 0) || 0;
  const productTotal = booking.booking_products?.reduce((sum, p) => sum + (p.total_price || 0), 0) || 0;
  const total = subtotal + productTotal;

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <Link href="/admin/bookings">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Bookings
              </Button>
            </Link>

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-semibold text-gray-900">
                    Booking #{booking.booking_number}
                  </h1>
                  <Badge className={getStatusColor(booking.status)}>
                    {booking.status}
                  </Badge>
                </div>
                <p className="text-gray-600">
                  {format(new Date(booking.scheduled_at), "PPP 'at' p")}
                </p>
              </div>

              <div className="flex gap-2">
                {!isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    {booking.status !== "cancelled" && booking.status !== "completed" && (
                      <>
                        <Button
                          variant="destructive"
                          onClick={() => setShowCancelDialog(true)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                        {booking.payment_transaction && (
                          <Button
                            variant="outline"
                            onClick={() => setShowRefundDialog(true)}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Refund
                          </Button>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditData(booking);
                      }}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Booking Information */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border rounded-lg p-6"
              >
                <h2 className="text-xl font-semibold mb-4">Booking Information</h2>
                
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editData.status || booking.status}
                        onValueChange={(value) =>
                          setEditData({ ...editData, status: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="no_show">No Show</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="scheduled_at">Scheduled Date & Time</Label>
                      <Input
                        id="scheduled_at"
                        type="datetime-local"
                        value={editData.scheduled_at ? format(new Date(editData.scheduled_at), "yyyy-MM-dd'T'HH:mm") : ""}
                        onChange={(e) =>
                          setEditData({ ...editData, scheduled_at: new Date(e.target.value).toISOString() })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="location_type">Location Type</Label>
                      <Select
                        value={editData.location_type || booking.location_type}
                        onValueChange={(value) =>
                          setEditData({ ...editData, location_type: value })
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
                    {editData.location_type === "at_home" && (
                      <>
                        <div>
                          <Label htmlFor="address_line1">Address Line 1</Label>
                          <Input
                            id="address_line1"
                            value={editData.address_line1 || ""}
                            onChange={(e) =>
                              setEditData({ ...editData, address_line1: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={editData.city || ""}
                            onChange={(e) =>
                              setEditData({ ...editData, city: e.target.value })
                            }
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={editData.notes || ""}
                        onChange={(e) =>
                          setEditData({ ...editData, notes: e.target.value })
                        }
                        rows={4}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Status</p>
                        <Badge className={getStatusColor(booking.status)}>
                          {booking.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Scheduled</p>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <p>{format(new Date(booking.scheduled_at), "PPP 'at' p")}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Location Type</p>
                      <p className="capitalize">{booking.location_type?.replace("_", " ")}</p>
                    </div>
                    {booking.location_type === "at_home" && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Address</p>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <p>{booking.address_line1}</p>
                            {booking.address_line2 && <p>{booking.address_line2}</p>}
                            <p>{booking.city}, {booking.country}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {booking.location && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Location</p>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <p className="font-medium">{booking.location.name}</p>
                            <p className="text-sm text-gray-600">
                              {booking.location.address_line1}, {booking.location.city}, {booking.location.country}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {booking.notes && (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Notes</p>
                        <p>{booking.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              {/* Services & Products */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white border rounded-lg p-6"
              >
                <h2 className="text-xl font-semibold mb-4">Services & Products</h2>
                
                {booking.booking_services && booking.booking_services.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-medium mb-3">Services</h3>
                    <div className="space-y-2">
                      {booking.booking_services.map((service) => (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">
                              {service.services?.title || service.services?.name || "Service"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {service.duration_minutes} minutes
                            </p>
                          </div>
                          <p className="font-semibold">
                            {booking.currency} {service.price?.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {booking.booking_products && booking.booking_products.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3">Products</h3>
                    <div className="space-y-2">
                      {booking.booking_products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium">
                              {product.products?.name || "Product"}
                            </p>
                            <p className="text-sm text-gray-500">
                              Qty: {product.quantity} × {booking.currency} {product.unit_price?.toFixed(2)}
                            </p>
                          </div>
                          <p className="font-semibold">
                            {booking.currency} {product.total_price?.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!booking.booking_services || booking.booking_services.length === 0) &&
                 (!booking.booking_products || booking.booking_products.length === 0) && (
                  <p className="text-gray-600">No services or products</p>
                )}
              </motion.div>

              {/* Payment Information */}
              {booking.payment_transaction && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white border rounded-lg p-6"
                >
                  <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <p className="text-gray-600">Status</p>
                      <Badge>
                        {booking.payment_transaction.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-gray-600">Amount</p>
                      <p className="font-semibold">
                        {booking.currency} {booking.payment_transaction.amount?.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-gray-600">Transaction ID</p>
                      <p className="font-mono text-sm">
                        {booking.payment_transaction.transaction_id || "N/A"}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Customer Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border rounded-lg p-6"
              >
                <h2 className="text-xl font-semibold mb-4">Customer</h2>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">{booking.customer?.full_name || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <p>{booking.customer?.email || "N/A"}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <p>{booking.customer?.phone || "N/A"}</p>
                    </div>
                  </div>
                  <Link href={`/admin/users/${booking.customer_id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      View Customer Profile
                    </Button>
                  </Link>
                </div>
              </motion.div>

              {/* Provider Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white border rounded-lg p-6"
              >
                <h2 className="text-xl font-semibold mb-4">Provider</h2>
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">{booking.provider?.business_name || "N/A"}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <p>{booking.provider?.email || "N/A"}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <p>{booking.provider?.phone || "N/A"}</p>
                    </div>
                  </div>
                  <Link href={`/admin/providers/${booking.provider_id}`}>
                    <Button variant="outline" size="sm" className="w-full">
                      View Provider Profile
                    </Button>
                  </Link>
                </div>
              </motion.div>

              {/* Pricing Summary */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white border rounded-lg p-6"
              >
                <h2 className="text-xl font-semibold mb-4">Pricing Summary</h2>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <p className="text-gray-600">Subtotal</p>
                    <p>{booking.currency} {subtotal.toFixed(2)}</p>
                  </div>
                  {productTotal > 0 && (
                    <div className="flex justify-between">
                      <p className="text-gray-600">Products</p>
                      <p>{booking.currency} {productTotal.toFixed(2)}</p>
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between">
                      <p className="font-semibold">Total</p>
                      <p className="font-semibold text-lg">
                        {booking.currency} {booking.total_amount?.toFixed(2) || total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Cancel Dialog */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Booking</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel this booking? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="cancel_reason">Reason (optional)</Label>
                <Textarea
                  id="cancel_reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Enter reason for cancellation..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCancelDialog(false);
                    setCancelReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleCancel}>
                  Confirm Cancellation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Refund Dialog */}
        <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Refund</DialogTitle>
              <DialogDescription>
                Process a refund for this booking.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="refund_amount">Refund Amount</Label>
                <Input
                  id="refund_amount"
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                  min={0}
                  max={booking.total_amount}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum: {booking.currency} {booking.total_amount?.toFixed(2)}
                </p>
              </div>
              <div>
                <Label htmlFor="refund_reason">Reason (optional)</Label>
                <Textarea
                  id="refund_reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason for refund..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRefundDialog(false);
                    setRefundReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleRefund}>
                  Process Refund
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

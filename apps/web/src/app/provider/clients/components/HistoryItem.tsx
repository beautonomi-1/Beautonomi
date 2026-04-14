"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  History,
  Mail,
  Printer,
  ShoppingBag,
  Tag,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/provider-portal/Money";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
interface ClientHistory {
  id: string;
  type: "appointment" | "sale" | "note";
  date: string;
  description: string;
  amount?: number;
  team_member_name?: string;
  status?: string;
  booking_number?: string;
  scheduled_at?: string;
  completed_at?: string;
  payment_status?: string;
  subtotal?: number;
  discount_amount?: number;
  discount_code?: string;
  tax_rate?: number;
  tax_amount?: number;
  service_fee_percentage?: number;
  service_fee_amount?: number;
  travel_fee?: number;
  tip_amount?: number;
  total_paid?: number;
  total_refunded?: number;
  location_type?: string;
  notes?: string;
  services?: Array<{
    offering_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    duration_minutes?: number;
    customization?: string;
    offerings?: {
      name: string;
      global_service_categories?: {
        name: string;
      };
    };
  }>;
  addons?: Array<{
    addon_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    service_addons?: {
      name: string;
    };
  }>;
  products?: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    products?: {
      name: string;
    };
  }>;
}

export interface HistoryItemProps {
  item: ClientHistory;
  clientEmail?: string;
}

function HistoryItemInner({ item, clientEmail }: HistoryItemProps) {
  const { provider: portalProvider } = useProviderPortal();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = item.type === "appointment" && (
    item.services?.length || 
    item.addons?.length || 
    item.products?.length ||
    item.subtotal !== undefined ||
    item.payment_status ||
    item.booking_number
  );

  const handlePrintInvoice = async (bookingId: string) => {
    try {
      if (!bookingId) {
        throw new Error("Booking ID is missing");
      }

      const cleanBookingId = String(bookingId).trim();
      const response = await fetch(`/api/provider/bookings/${cleanBookingId}/receipt/pdf`, {
        credentials: "include",
      });

      if (!response.ok) {
        let errorMessage = "Failed to generate invoice";
        try {
          const result = await response.json();
          if (result.error) {
            errorMessage = typeof result.error === "string" ? result.error : result.error.message || errorMessage;
          }
        } catch {
          errorMessage = `Failed to generate invoice (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const pdfWindow = window.open(url, "_blank");
      if (!pdfWindow) {
        const link = document.createElement("a");
        link.href = url;
        link.download = `invoice-${cleanBookingId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate invoice");
    }
  };

  const handleEmailInvoice = async (bookingId: string, email?: string) => {
    if (!email) {
      toast.error("Client email is required to send invoice");
      return;
    }

    try {
      if (!bookingId) {
        throw new Error("Booking ID is missing");
      }

      const { fetcher } = await import("@/lib/http/fetcher");
      await fetcher.post(`/api/provider/bookings/${bookingId}/receipt/send`, { email });

      toast.success(`Invoice sent to ${email}`);
    } catch (error) {
      console.error("Failed to send invoice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send invoice");
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-600";
    const statusLower = status.toLowerCase();
    if (statusLower === "completed") return "bg-green-100 text-green-700";
    if (statusLower === "cancelled" || statusLower === "canceled") return "bg-red-100 text-red-700";
    if (statusLower === "booked" || statusLower === "confirmed") return "bg-blue-100 text-blue-700";
    if (statusLower === "pending") return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-600";
  };

  const getPaymentStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-600";
    const statusLower = status.toLowerCase();
    if (statusLower === "paid") return "bg-green-100 text-green-700";
    if (statusLower === "partially_paid") return "bg-yellow-100 text-yellow-700";
    if (statusLower === "refunded") return "bg-red-100 text-red-700";
    if (statusLower === "pending") return "bg-gray-100 text-gray-600";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Summary Row */}
      <div
        className={`flex items-start gap-3 p-3 ${
          hasDetails ? "cursor-pointer hover:bg-gray-50" : ""
        }`}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <div
          className={`p-2 rounded-full flex-shrink-0 ${
            item.type === "appointment"
              ? "bg-blue-100 text-blue-600"
              : item.type === "sale"
              ? "bg-green-100 text-green-600"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {item.type === "appointment" ? (
            <Calendar className="w-4 h-4" />
          ) : item.type === "sale" ? (
            <DollarSign className="w-4 h-4" />
          ) : (
            <History className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {item.description}
                {item.services && item.services.length > 0 && (
                  <span className="text-gray-600 font-normal ml-2">
                    - {item.services.map((s: any) => s.offerings?.name || "Service").join(", ")}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-600 mt-1 flex-wrap">
                <span>{new Date(item.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}</span>
                {item.scheduled_at && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.scheduled_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                )}
                {item.team_member_name && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.team_member_name}
                    </span>
                  </>
                )}
                {item.status && (
                  <>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item.amount !== undefined && item.amount > 0 && (
                <p className="font-semibold text-sm">
                  <Money amount={item.amount} />
                </p>
              )}
              {hasDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && item.type === "appointment" && (
        <div className="border-t border-gray-200 bg-white p-4 space-y-4">
          {/* Booking Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {item.booking_number && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Booking Number</p>
                <p className="font-medium">{item.booking_number}</p>
              </div>
            )}
            {item.payment_status && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Payment Status</p>
                {(() => {
                  const totalPaid = item.total_paid || 0;
                  const totalAmount = item.amount || 0;
                  const actualPaymentStatus = totalPaid > 0 && totalPaid < totalAmount 
                    ? 'partially_paid' 
                    : item.payment_status;
                  
                  return (
                    <>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getPaymentStatusColor(actualPaymentStatus)}`}>
                        {actualPaymentStatus.replace("_", " ")}
                      </span>
                      {totalPaid > 0 && totalPaid < totalAmount && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Paid: <Money amount={totalPaid} /> of <Money amount={totalAmount} />
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {item.team_member_name && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Staff Member</p>
                <p className="font-medium">{item.team_member_name}</p>
              </div>
            )}
            {item.location_type && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Location</p>
                <p className="font-medium capitalize">{item.location_type.replace("_", " ")}</p>
              </div>
            )}
            {item.completed_at && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Completed</p>
                <p className="font-medium">
                  {new Date(item.completed_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Services */}
          {item.services && item.services.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Services ({item.services.length})
              </p>
              <div className="space-y-2">
                {item.services.map((service, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">
                          {service.offerings?.name || "Service"}
                          {service.offerings?.global_service_categories?.name && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({service.offerings.global_service_categories.name})
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                          {service.quantity > 1 && (
                            <span>Qty: {service.quantity}</span>
                          )}
                          {service.duration_minutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {service.duration_minutes} min
                            </span>
                          )}
                          <span>
                            <Money amount={service.unit_price} />
                            {service.quantity > 1 && (
                              <span> × {service.quantity} = <Money amount={service.total_price} /></span>
                            )}
                          </span>
                        </div>
                        {service.customization && (
                          <p className="text-xs text-gray-500 mt-1 italic">{service.customization}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Addons */}
          {item.addons && item.addons.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Add-ons ({item.addons.length})
              </p>
              <div className="space-y-2">
                {item.addons.map((addon, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{addon.service_addons?.name || "Add-on"}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                          {addon.quantity > 1 && (
                            <span>Qty: {addon.quantity}</span>
                          )}
                          <span>
                            <Money amount={addon.unit_price} />
                            {addon.quantity > 1 && (
                              <span> × {addon.quantity} = <Money amount={addon.total_price} /></span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Products */}
          {item.products && item.products.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" />
                Products ({item.products.length})
              </p>
              <div className="space-y-2">
                {item.products.map((product, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{product.products?.name || "Product"}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                          {product.quantity > 1 && (
                            <span>Qty: {product.quantity}</span>
                          )}
                          <span>
                            <Money amount={product.unit_price} />
                            {product.quantity > 1 && (
                              <span> × {product.quantity} = <Money amount={product.total_price} /></span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Breakdown */}
          {(item.subtotal !== undefined || item.discount_amount || item.tax_amount || item.service_fee_amount || item.travel_fee || item.tip_amount) && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                Financial Breakdown
              </p>
              <div className="space-y-1.5 text-sm">
                {item.subtotal !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium"><Money amount={item.subtotal} /></span>
                  </div>
                )}
                {item.discount_amount && item.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Discount
                      {item.discount_code && (
                        <span className="text-xs ml-1">({item.discount_code})</span>
                      )}
                    </span>
                    <span className="font-medium">-<Money amount={item.discount_amount} /></span>
                  </div>
                )}
                {item.tax_amount !== undefined && item.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Tax
                      {item.tax_rate !== undefined && item.tax_rate !== null && item.tax_rate !== 0 && (
                        <span className="text-xs ml-1">
                          ({(() => {
                            const rate = typeof item.tax_rate === 'number' 
                              ? item.tax_rate 
                              : parseFloat(String(item.tax_rate)) || 0;
                            return rate > 1 ? rate.toFixed(1) : (rate * 100).toFixed(1);
                          })()}%)
                        </span>
                      )}
                    </span>
                    <span className="font-medium"><Money amount={item.tax_amount} /></span>
                  </div>
                )}
                {item.travel_fee && item.travel_fee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Travel Fee</span>
                    <span className="font-medium"><Money amount={item.travel_fee} /></span>
                  </div>
                )}
                {(() => {
                  let displayServiceFeeAmount = parseFloat(String(item.service_fee_amount || 0));
                  if (displayServiceFeeAmount === 0 && item.subtotal !== undefined && item.amount) {
                    const subtotal = parseFloat(String(item.subtotal || 0));
                    const discount = parseFloat(String(item.discount_amount || 0));
                    const tax = parseFloat(String(item.tax_amount || 0));
                    const tip = parseFloat(String(item.tip_amount || 0));
                    const travel = parseFloat(String(item.travel_fee || 0));
                    const total = parseFloat(String(item.amount || 0));
                    
                    const calculatedServiceFee = total - subtotal + discount - tax - travel - tip;
                    if (calculatedServiceFee > 0.01) {
                      displayServiceFeeAmount = Math.round(calculatedServiceFee * 100) / 100;
                    }
                  }
                  
                  if (displayServiceFeeAmount > 0) {
                    return (
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Service Fee
                          {item.service_fee_percentage !== undefined && item.service_fee_percentage !== null && item.service_fee_percentage !== 0 && (
                            <span className="text-xs ml-1">
                              ({(() => {
                                const rate = typeof item.service_fee_percentage === 'number' 
                                  ? item.service_fee_percentage 
                                  : parseFloat(String(item.service_fee_percentage)) || 0;
                                return rate > 1 ? rate.toFixed(1) : (rate * 100).toFixed(1);
                              })()}%)
                            </span>
                          )}
                        </span>
                        <span className="font-medium"><Money amount={displayServiceFeeAmount} /></span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {item.tip_amount && item.tip_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tip</span>
                    <span className="font-medium"><Money amount={item.tip_amount} /></span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
                  <span>Total</span>
                  <span><Money amount={item.amount || 0} /></span>
                </div>
                {item.total_paid !== undefined && item.total_paid > 0 && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-600">Paid</span>
                    <span className="font-medium text-green-600"><Money amount={item.total_paid} /></span>
                  </div>
                )}
                {item.total_refunded !== undefined && item.total_refunded > 0 && (
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-600">Refunded</span>
                    <span className="font-medium text-red-600"><Money amount={item.total_refunded} /></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Notes</p>
              <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{item.notes}</p>
            </div>
          )}

          {/* Invoice Actions */}
          {item.type === "appointment" && item.id && (
            <div className="border-t border-gray-200 pt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrintInvoice(item.id);
                }}
                className="flex-1"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEmailInvoice(item.id, clientEmail);
                }}
                disabled={!clientEmail}
                className="flex-1"
              >
                <Mail className="w-4 h-4 mr-2" />
                Email Invoice
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const HistoryItem = React.memo(HistoryItemInner, (prevProps, nextProps) => {
  return prevProps.item.id === nextProps.item.id && prevProps.item.status === nextProps.item.status;
});

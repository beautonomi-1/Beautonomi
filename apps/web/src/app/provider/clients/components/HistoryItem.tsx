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
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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

function generateInvoiceHTMLFromData(invoiceData: any, portalCurrency?: string) {
  const displayCurrency =
    (invoiceData.currency as string | undefined)?.trim() ||
    portalCurrency?.trim() ||
    LAST_RESORT_CURRENCY;
  const formatCurrency = (amount: number) => {
    return `${displayCurrency} ${amount.toFixed(2)}`;
  };

  return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoiceData.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f5f5f5; }
            .total { font-size: 18px; font-weight: bold; }
            .text-right { text-align: right; }
            .summary { margin-top: 20px; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
            .summary-total { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>INVOICE</h1>
            <p>Invoice #: ${invoiceData.invoice_number}</p>
            <p>Date: ${invoiceData.invoice_date}</p>
            ${invoiceData.booking_date ? `<p>Booking Date: ${invoiceData.booking_date}</p>` : ''}
          </div>
          
          <div class="invoice-details">
            <div>
              <h3>From:</h3>
              <p><strong>${invoiceData.provider.name}</strong></p>
              ${invoiceData.provider.email ? `<p>Email: ${invoiceData.provider.email}</p>` : ''}
              ${invoiceData.provider.phone ? `<p>Phone: ${invoiceData.provider.phone}</p>` : ''}
              ${invoiceData.provider.address.line1 ? `<p>${invoiceData.provider.address.line1}</p>` : ''}
              ${invoiceData.provider.address.line2 ? `<p>${invoiceData.provider.address.line2}</p>` : ''}
              ${invoiceData.provider.address.city ? `<p>${invoiceData.provider.address.city}${invoiceData.provider.address.state ? ', ' + invoiceData.provider.address.state : ''} ${invoiceData.provider.address.postal_code || ''}</p>` : ''}
            </div>
            <div>
              <h3>Bill To:</h3>
              <p><strong>${invoiceData.customer.name}</strong></p>
              ${invoiceData.customer.email ? `<p>Email: ${invoiceData.customer.email}</p>` : ''}
              ${invoiceData.customer.phone ? `<p>Phone: ${invoiceData.customer.phone}</p>` : ''}
            </div>
          </div>
          
          ${invoiceData.location_type === 'at_home' && invoiceData.service_address ? `
            <div class="section" style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <h3 style="margin-top: 0;">Service Location:</h3>
              ${invoiceData.service_address.line1 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line1}</p>` : ''}
              ${invoiceData.service_address.line2 ? `<p style="margin: 5px 0;">${invoiceData.service_address.line2}</p>` : ''}
              ${invoiceData.service_address.city ? `<p style="margin: 5px 0;">${invoiceData.service_address.city}${invoiceData.service_address.state ? ', ' + invoiceData.service_address.state : ''} ${invoiceData.service_address.postal_code || ''}</p>` : ''}
            </div>
          ` : ''}
          
          <div class="section">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceData.items.map((item: any) => `
                  <tr>
                    <td>${item.description}${item.staff ? ` (${item.staff})` : ''}${item.duration ? ` (${item.duration} min)` : ''}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">${formatCurrency(item.unit_price)}</td>
                    <td class="text-right">${formatCurrency(item.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(invoiceData.subtotal)}</span>
            </div>
            ${invoiceData.discount_amount > 0 ? `
              <div class="summary-row">
                <span>Discount${invoiceData.discount_reason ? ` (${invoiceData.discount_reason})` : ''}:</span>
                <span>-${formatCurrency(invoiceData.discount_amount)}</span>
              </div>
            ` : ''}
            ${invoiceData.travel_fee > 0 ? `
              <div class="summary-row">
                <span>Travel Fee:</span>
                <span>${formatCurrency(invoiceData.travel_fee)}</span>
              </div>
            ` : ''}
            ${invoiceData.tax_amount > 0 ? `
              <div class="summary-row">
                <span>Tax${invoiceData.tax_rate > 0 ? ` (${invoiceData.tax_rate.toFixed(1)}%)` : ''}:</span>
                <span>${formatCurrency(invoiceData.tax_amount)}</span>
              </div>
            ` : ''}
            ${(invoiceData as any).service_fee_amount > 0 ? `
              <div class="summary-row">
                <span>Service Fee${(invoiceData as any).service_fee_percentage > 0 ? ` (${((invoiceData as any).service_fee_percentage * 100).toFixed(1)}%)` : ''}:</span>
                <span>${formatCurrency((invoiceData as any).service_fee_amount)}</span>
              </div>
            ` : ''}
            ${invoiceData.tip_amount > 0 ? `
              <div class="summary-row">
                <span>Tip:</span>
                <span>${formatCurrency(invoiceData.tip_amount)}</span>
              </div>
            ` : ''}
            <div class="summary-row summary-total">
              <span>Total Amount:</span>
              <span>${formatCurrency(invoiceData.total_amount)}</span>
            </div>
          </div>
          
          ${invoiceData.payment_status ? `
            <div class="section" style="margin-top: 20px; padding: 10px; background-color: ${
              invoiceData.payment_status === 'paid' ? '#d4edda' : 
              invoiceData.payment_status === 'pending' ? '#fff3cd' : '#f8d7da'
            }; border-radius: 5px;">
              <p style="margin: 0;"><strong>Payment Status:</strong> ${
                invoiceData.payment_status === 'paid' ? 'PAID' :
                invoiceData.payment_status === 'pending' ? 'PENDING' :
                invoiceData.payment_status === 'failed' ? 'FAILED' :
                invoiceData.payment_status.toUpperCase()
              }</p>
            </div>
          ` : ''}
          
          ${invoiceData.notes ? `
            <div class="section">
              <h3>Notes:</h3>
              <p>${invoiceData.notes}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;
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
      const { fetcher } = await import("@/lib/http/fetcher");
      const result = await fetcher.get<{ data: any }>(`/api/provider/bookings/${cleanBookingId}/receipt`);
      const invoiceData = result.data;

      if (!invoiceData) {
        throw new Error("Invoice data is missing");
      }
      
      const invoiceWindow = window.open('', '_blank');
      if (!invoiceWindow) {
        toast.error("Please allow popups to print invoice");
        return;
      }
      
      const invoiceHTML = generateInvoiceHTMLFromData(invoiceData, portalProvider?.currency);
      invoiceWindow.document.write(invoiceHTML);
      invoiceWindow.document.close();
      invoiceWindow.focus();
      setTimeout(() => {
        invoiceWindow.print();
      }, 250);
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

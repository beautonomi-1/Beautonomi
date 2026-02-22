"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CreditCard,
  Banknote,
  Smartphone,
  Gift,
  Wallet,
  Check,
  Tag,
  Mail,
  Printer,
  ChevronRight,
  Clock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  quantity: number;
}

interface ProductItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CheckoutData {
  appointment_id: string;
  client_id: string;
  client_name: string;
  client_email?: string;
  team_member_name: string;
  scheduled_date: string;
  scheduled_time: string;
  services: ServiceItem[];
  products?: ProductItem[];
}

interface CheckoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutData: CheckoutData | null;
  onComplete: (
    paymentMethod: string,
    tipAmount: number,
    discountAmount: number,
    notes: string
  ) => void;
}

type PaymentMethod = "card" | "cash" | "mobile" | "gift_card" | "split";

const PAYMENT_METHODS: { id: PaymentMethod; name: string; description: string; icon: React.ElementType }[] = [
  { id: "cash", name: "Cash", description: "Pay with cash", icon: Banknote },
  { id: "card", name: "Card (Terminal)", description: "Process via card terminal", icon: CreditCard },
  { id: "mobile", name: "EFT / Bank Transfer", description: "Instant EFT or bank transfer", icon: Smartphone },
  { id: "gift_card", name: "Gift Card", description: "Redeem gift card balance", icon: Gift },
  { id: "split", name: "Split Payment", description: "Split between multiple methods", icon: Wallet },
];

const TIP_PERCENTAGES = [0, 10, 15, 20, 25];

export function CheckoutDialog({
  isOpen,
  onClose,
  checkoutData,
  onComplete,
}: CheckoutDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [tipPercentage, setTipPercentage] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [notes, setNotes] = useState("");
  const [sendReceipt, setSendReceipt] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"review" | "payment" | "complete">("review");

  // Calculate totals
  const calculations = useMemo(() => {
    if (!checkoutData) return { subtotal: 0, discount: 0, tip: 0, total: 0 };

    const servicesTotal = checkoutData.services.reduce(
      (sum, s) => sum + s.price * s.quantity,
      0
    );
    const productsTotal = checkoutData.products?.reduce(
      (sum, p) => sum + p.price * p.quantity,
      0
    ) || 0;
    const subtotal = servicesTotal + productsTotal;

    let discount = 0;
    if (discountValue) {
      if (discountType === "percentage") {
        discount = (subtotal * parseFloat(discountValue)) / 100;
      } else {
        discount = parseFloat(discountValue);
      }
    }

    const afterDiscount = Math.max(subtotal - discount, 0);

    let tip = 0;
    if (customTip) {
      tip = parseFloat(customTip);
    } else if (tipPercentage > 0) {
      tip = (afterDiscount * tipPercentage) / 100;
    }

    const total = afterDiscount + tip;

    return { subtotal, discount, tip, total };
  }, [checkoutData, discountType, discountValue, tipPercentage, customTip]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const handleComplete = async () => {
    setIsProcessing(true);
    try {
      await onComplete(
        paymentMethod,
        calculations.tip,
        calculations.discount,
        notes
      );
      setStep("complete");
      // Auto-close after 2 seconds on success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Checkout failed:", error);
      // Don't set step to complete if there was an error
      // The error will be handled by the parent component
      throw error; // Re-throw so parent knows it failed
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep("review");
    setPaymentMethod("card");
    setTipPercentage(0);
    setCustomTip("");
    setDiscountValue("");
    setPromoCode("");
    setNotes("");
    onClose();
  };

  if (!checkoutData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 bg-gradient-to-r from-[#FF0077] to-[#FF6B35] text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                {step === "complete" ? "Payment Complete!" : "Checkout"}
              </DialogTitle>
              <DialogDescription className="text-white/80 mt-1">
                {checkoutData.client_name} • {checkoutData.team_member_name}
              </DialogDescription>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/70">
                {new Date(checkoutData.scheduled_date).toLocaleDateString("en-ZA", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p className="text-lg font-bold">{checkoutData.scheduled_time}</p>
            </div>
          </div>
        </DialogHeader>

        {step === "complete" ? (
          /* Success State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Payment Successful!</h3>
            <p className="text-gray-600 mb-6">
              {formatCurrency(calculations.total)} paid via{" "}
              {PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.name}
            </p>

            <div className="flex gap-3 w-full max-w-xs">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={async () => {
                  try {
                    const { providerApi } = await import("@/lib/provider-portal/api");
                    const blob = await providerApi.printReceipt(checkoutData.appointment_id);
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `receipt-${checkoutData.appointment_id}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error("Failed to print receipt:", error);
                    alert("Failed to print receipt. Please try again.");
                  }
                }}
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={async () => {
                  try {
                    const { providerApi } = await import("@/lib/provider-portal/api");
                    await providerApi.sendReceiptEmail(
                      checkoutData.appointment_id,
                      checkoutData.client_email
                    );
                    alert("Receipt sent successfully!");
                  } catch (error) {
                    console.error("Failed to send receipt:", error);
                    alert("Failed to send receipt. Please try again.");
                  }
                }}
              >
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
            </div>

            <Button
              onClick={handleClose}
              className="mt-6 bg-[#FF0077] hover:bg-[#D60565]"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {step === "review" && (
                <>
                  {/* Services */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      Services
                    </h3>
                    {checkoutData.services.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#FF0077]/10 flex items-center justify-center">
                            <Clock className="w-4 h-4 text-[#FF0077]" />
                          </div>
                          <div>
                            <p className="font-medium">{service.name}</p>
                            <p className="text-xs text-gray-500">
                              {service.duration_minutes} min
                              {service.quantity > 1 && ` × ${service.quantity}`}
                            </p>
                          </div>
                        </div>
                        <p className="font-semibold">
                          {formatCurrency(service.price * service.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Products */}
                  {checkoutData.products && checkoutData.products.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        Products
                      </h3>
                      {checkoutData.products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                              <Tag className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                Qty: {product.quantity}
                              </p>
                            </div>
                          </div>
                          <p className="font-semibold">
                            {formatCurrency(product.price * product.quantity)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Discount */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Discount</Label>
                      <div className="flex items-center gap-2">
                        <Select
                          value={discountType}
                          onValueChange={(v) =>
                            setDiscountType(v as "percentage" | "fixed")
                          }
                        >
                          <SelectTrigger className="w-24 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="fixed">R</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder="0"
                          className="w-20 h-8"
                        />
                      </div>
                    </div>

                    {/* Promo Code */}
                    <div className="flex gap-2">
                      <Input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        placeholder="Promo code"
                        className="h-9"
                      />
                      <Button variant="outline" size="sm">
                        Apply
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Tip Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Add Tip</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {TIP_PERCENTAGES.map((percent) => (
                        <Button
                          key={percent}
                          type="button"
                          variant={tipPercentage === percent && !customTip ? "default" : "outline"}
                          className={cn(
                            "h-12 flex flex-col",
                            tipPercentage === percent && !customTip && "bg-[#FF0077] hover:bg-[#D60565]"
                          )}
                          onClick={() => {
                            setTipPercentage(percent);
                            setCustomTip("");
                          }}
                        >
                          <span className="text-xs">{percent}%</span>
                          <span className="text-[10px] opacity-70">
                            {formatCurrency((calculations.subtotal - calculations.discount) * percent / 100)}
                          </span>
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={customTip}
                        onChange={(e) => {
                          setCustomTip(e.target.value);
                          setTipPercentage(0);
                        }}
                        placeholder="Custom amount"
                        className="h-9"
                      />
                    </div>
                  </div>
                </>
              )}

              {step === "payment" && (
                <>
                  {/* Payment Method Selection - Mangomint style */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Payment Method</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_METHODS.map((method) => {
                        const Icon = method.icon;
                        const isSelected = paymentMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            className={cn(
                              "relative p-3 rounded-xl border-2 text-left transition-all",
                              isSelected 
                                ? "border-[#FF0077] bg-[#FF0077]/5 shadow-sm" 
                                : "border-gray-200 hover:border-gray-300 bg-white"
                            )}
                            onClick={() => setPaymentMethod(method.id)}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#FF0077] flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                                isSelected ? "bg-[#FF0077]/10 text-[#FF0077]" : "bg-gray-100 text-gray-500"
                              )}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={cn(
                                  "font-medium text-sm",
                                  isSelected ? "text-[#FF0077]" : "text-gray-900"
                                )}>
                                  {method.name}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{method.description}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add payment notes..."
                      className="h-20 resize-none"
                    />
                  </div>

                  {/* Receipt Options */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="send-receipt"
                      checked={sendReceipt}
                      onCheckedChange={(checked) => setSendReceipt(checked as boolean)}
                    />
                    <Label htmlFor="send-receipt" className="text-sm cursor-pointer">
                      Send receipt to {checkoutData.client_email || "client"}
                    </Label>
                  </div>
                </>
              )}
            </div>

            {/* Footer with Totals */}
            <div className="border-t bg-gray-50 px-6 py-4 space-y-3">
              {/* Totals Summary */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatCurrency(calculations.subtotal)}</span>
                </div>
                {calculations.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(calculations.discount)}</span>
                  </div>
                )}
                {calculations.tip > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tip</span>
                    <span>{formatCurrency(calculations.tip)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-[#FF0077]">{formatCurrency(calculations.total)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {step === "review" ? (
                  <>
                    <Button variant="outline" className="flex-1" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
                      onClick={() => setStep("payment")}
                    >
                      Continue to Payment
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1" onClick={() => setStep("review")}>
                      Back
                    </Button>
                    <Button
                      className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
                      onClick={handleComplete}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Pay {formatCurrency(calculations.total)}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

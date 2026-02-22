"use client";
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import AddPaymentModal from "./components/add-payment-modal";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "../components/back-button";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { CreditCard, Trash2, Star, ExternalLink, Info, Plus } from "lucide-react";
import { toast } from "sonner";
import AuthGuard from "@/components/auth/auth-guard";
import { useAuth } from "@/providers/AuthProvider";
import { motion } from "framer-motion";
import GiftCardsSection from "./components/GiftCardsSection";

interface PaymentMethod {
  id: string;
  type: string;
  card_type?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  cardholder_name?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

const PaymentPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("payments");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [isRedeemingCoupon, setIsRedeemingCoupon] = useState(false);
  const [couponCount, setCouponCount] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const SAVE_CARD_INFO =
    "We'll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.";

  // Only show payouts tab for providers
  const isProvider = user?.role === 'provider_owner' || user?.role === 'provider_staff';

  const [paymentSafetyCopy, setPaymentSafetyCopy] = useState<{
    title: string;
    body: string;
    learn_more_url: string;
    learn_more_label: string;
  } | null>(null);

  useEffect(() => {
    loadPaymentMethods();
    loadCouponCount();
    loadPaymentSafetyCopy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only load

  const loadPaymentSafetyCopy = async () => {
    try {
      const res = await fetcher.get<{ data: typeof paymentSafetyCopy }>("/api/public/payment-safety-copy", { cache: "no-store" });
      if (res?.data) setPaymentSafetyCopy(res.data);
    } catch {
      // use fallback in render
    }
  };

  const loadCouponCount = async () => {
    try {
      const response = await fetcher.get<{ data: { count: number } }>("/api/me/coupons/count", { cache: "no-store" });
      setCouponCount(response.data?.count || 0);
    } catch (error) {
      console.error("Failed to load coupon count:", error);
      // Don't show error, just default to 0
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    try {
      setIsRedeemingCoupon(true);
      await fetcher.post("/api/me/coupons/redeem", { code: couponCode.trim() });
      toast.success("Coupon redeemed successfully!");
      setCouponCode("");
      setShowCouponInput(false);
      loadCouponCount();
    } catch (error: any) {
      toast.error(error.message || "Failed to redeem coupon. Please check the code and try again.");
    } finally {
      setIsRedeemingCoupon(false);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: PaymentMethod[] }>("/api/me/payment-methods", { cache: "no-store" });
      setPaymentMethods(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load payment methods";
      setError(errorMessage);
      console.error("Error loading payment methods:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
    if (!confirm("Are you sure you want to remove this payment method?")) return;

    try {
      await fetcher.delete("/api/me/payment-methods", { id });
      toast.success("Payment method removed");
      loadPaymentMethods();
    } catch (err) {
      toast.error("Failed to remove payment method");
      console.error("Error deleting payment method:", err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetcher.patch<{ data?: unknown; error?: { message?: string } }>(`/api/me/payment-methods/${id}`, { is_default: true });
      if (res?.error) {
        toast.error(res.error.message || "Failed to set default");
        return;
      }
      toast.success("Default card updated");
      loadPaymentMethods();
    } catch {
      toast.error("Failed to set default card");
    }
  };

  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const res = await fetcher.post<{ data?: { authorization_url?: string }; error?: { message?: string } }>(
        "/api/me/payment-methods/initialize-verification",
        { set_as_default: paymentMethods.length === 0 }
      );
      const url = res?.data?.authorization_url;
      if (!url) {
        toast.error((res as any)?.error?.message || "Could not start card verification");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info("Complete verification in the new tab, then refresh this page.");
    } catch (err: any) {
      toast.error(err?.message || "Could not add card");
    } finally {
      setAddingCard(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    loadPaymentMethods(); // Refresh list after adding
  };
  const handleAddCouponClick = () => setShowCouponInput(true);
  const handleCancelCoupon = () => {
    setShowCouponInput(false);
    setCouponCode("");
  };
  
  const [focusField, setFocusField] = useState({
    cardNumber: false,
    expiration: false,
    cvv: false,
    coupon: false,
  });

  const handleFocus = (field: string) => {
    setFocusField({ ...focusField, [field]: true });
  };

  const handleBlur = (field: string, e: React.FocusEvent<HTMLInputElement, Element>) => {
    if (!e.target.value) {
      setFocusField({ ...focusField, [field]: false });
    }
  };
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <BackButton href="/account-settings" />
          <Breadcrumb 
            items={[
              { label: "Account", href: "/account-settings" },
              { label: "Payments & payouts" }
            ]} 
          />
          
          {/* Page Header - Glass Card Style */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-6"
          >
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900">Payments & payouts</h1>
            <p className="text-sm md:text-base text-gray-600 font-light">
              Manage your payment methods, coupons, and gift cards
            </p>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto whitespace-nowrap mb-8">
              <TabsList className="flex gap-5 border-b bg-transparent">
                <TabsTrigger
                  value="payments"
                  className={`py-2 font-light transition-colors ${
                    activeTab === "payments"
                      ? "border-b-2 border-[#FF0077] text-[#FF0077] text-sm font-semibold"
                      : "border-b-2 border-transparent text-sm text-gray-500 hover:text-[#FF0077]"
                  }`}
                >
                  Payments
                </TabsTrigger>
                {isProvider && (
                  <TabsTrigger
                    value="payouts"
                    className={`py-2 font-light transition-colors ${
                      activeTab === "payouts"
                        ? "border-b-2 border-[#FF0077] text-[#FF0077] text-sm font-semibold"
                        : "border-b-2 border-transparent text-sm text-gray-500 hover:text-[#FF0077]"
                    }`}
                  >
                    Payouts
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

        <TabsContent value="payments">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="w-full md:w-2/3">
              {/* Payment History Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Your payments</h2>
                <p className="text-base font-light mb-6 text-gray-600">
                  Keep track of all your payments and refunds.
                </p>
                <Link href="/account-settings/bookings">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl mb-6 md:mb-8 font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
                  >
                    View booking payments
                  </motion.button>
                </Link>
              </motion.div>

              {/* Payment Methods Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Payment methods</h2>
                  <button
                    type="button"
                    onClick={() => toast.info(SAVE_CARD_INFO, { duration: 8000 })}
                    className="p-1 rounded-full hover:bg-gray-100 text-[#FF0077]"
                    aria-label="Info about saving card"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-base mb-3 font-light text-gray-600">
                  We&apos;ll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.
                </p>
                
                {isLoading ? (
                  <div className="mb-6">
                    <LoadingTimeout loadingMessage="Loading payment methods..." />
                  </div>
                ) : error ? (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-red-800 text-sm">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadPaymentMethods}
                      className="mt-2"
                    >
                      Retry
                    </Button>
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="mb-6 p-6 border border-gray-200 rounded-xl text-center backdrop-blur-sm bg-white/60">
                    <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2 font-medium">No payment methods saved</p>
                    <p className="text-sm text-gray-500 mb-4">
                      Cards are saved automatically when you make a payment with Paystack
                    </p>
                    <Link href="/">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
                      >
                        Book a service to save a card
                      </motion.button>
                    </Link>
                  </div>
                ) : (
                  <div className="mb-6 space-y-3">
                    {paymentMethods.map((method, index) => (
                      <motion.div
                        key={method.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * index }}
                        whileHover={{ scale: 1.01 }}
                        className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4 flex items-center justify-between hover:shadow-lg transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <CreditCard className="w-8 h-8 text-[#FF0077]" />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900">
                                {method.card_type ? method.card_type.charAt(0).toUpperCase() + method.card_type.slice(1) : "Card"}
                                {method.last4 && ` •••• ${method.last4}`}
                              </span>
                              {method.is_default ? (
                                <span className="px-2 py-1 bg-gradient-to-r from-[#FF0077] to-[#E6006A] text-white text-xs rounded-full flex items-center gap-1">
                                  <Star className="w-3 h-3 fill-white" />
                                  Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetDefault(method.id)}
                                  className="text-xs font-medium text-[#FF0077] hover:text-[#E6006A] underline"
                                >
                                  Set default
                                </button>
                              )}
                            </div>
                            {method.cardholder_name && (
                              <p className="text-sm text-gray-600">{method.cardholder_name}</p>
                            )}
                            {method.expiry_month && method.expiry_year && (
                              <p className="text-xs text-gray-500">
                                Expires {String(method.expiry_month).padStart(2, '0')}/{String(method.expiry_year).slice(-2)}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePaymentMethod(method.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
                <motion.button
                  type="button"
                  onClick={handleAddCard}
                  disabled={addingCard}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#FF0077] text-gray-600 hover:text-[#FF0077] transition-all mt-3 disabled:opacity-60"
                >
                  {addingCard ? (
                    <span className="text-sm font-medium">Opening...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span className="text-sm font-medium">Add card</span>
                    </>
                  )}
                </motion.button>
              </motion.div>

              <GiftCardsSection />

              {/* Coupons Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Coupons</h2>
                <div className="flex justify-between items-center mb-4 font-medium text-gray-700">
                  <span>Your coupons</span>
                  <span className="text-[#FF0077] font-semibold">{couponCount}</span>
                </div>

                {!showCouponInput ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAddCouponClick}
                    className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
                  >
                    Add coupon
                  </motion.button>
                ) : (
                  <div className="space-y-4">
                    <div className="py-2 relative border border-white/40 rounded-lg backdrop-blur-sm bg-white/60">
                        {focusField.coupon && (
                          <Label
                            htmlFor="coupon"
                            className="absolute top-1 left-3 text-xs text-gray-500"
                          >
                            Enter a coupon code
                          </Label>
                        )}
                        <Input
                          id="coupon"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder={!focusField.coupon ? "Enter a coupon code" : ""}
                          className="px-3 py-2 border-none bg-transparent"
                          onFocus={() => handleFocus("coupon")}
                          onBlur={(e) => handleBlur("coupon", e)}
                          disabled={isRedeemingCoupon}
                        />
                      </div>
                    <div className="flex space-x-4"> 
                      <Button
                        onClick={handleRedeemCoupon}
                        disabled={isRedeemingCoupon || !couponCode.trim()}
                        className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white"
                      >
                        {isRedeemingCoupon ? "Redeeming..." : "Redeem Coupon"}
                      </Button>
                      <Button
                        onClick={handleCancelCoupon}
                        variant="outline"
                        disabled={isRedeemingCoupon}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
            
            {/* Sidebar - Info Card (managed by superadmin) */}
            <div className="w-full md:w-1/3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 sticky top-6"
              >
                <div className="flex items-center mb-4">
                  <h2 className="text-lg font-semibold tracking-tighter text-gray-900">
                    {paymentSafetyCopy?.title ?? "Make all payments through Beautonomi"}
                  </h2>
                </div>
                <p className="mb-4 text-sm font-light text-gray-600 leading-relaxed">
                  {paymentSafetyCopy?.body ?? "Always pay and communicate through Beautonomi to ensure you're protected under our Terms of Service, Payments Terms of Service, cancellation, and other safeguards."}
                </p>
                <Link 
                  href={paymentSafetyCopy?.learn_more_url ?? "/terms-and-condition"} 
                  className="text-[#FF0077] hover:text-[#E6006A] text-sm font-medium underline transition-colors inline-flex items-center gap-1.5 group"
                >
                  <span>{paymentSafetyCopy?.learn_more_label ?? "Learn more"}</span>
                  <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </motion.div>
            </div>
          </div>
        </TabsContent>

        {isProvider && (
          <TabsContent value="payouts">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="w-full md:w-2/3">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6"
                >
                  <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">
                    How you&apos;ll get paid
                  </h2>
                  <p className="text-base mb-6 font-light text-gray-600">
                    Add at least one payout method so we know where to send your
                    money via Paystack.
                  </p>
                  <Link href="/provider/settings/payout-accounts">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
                    >
                      Set up payouts
                    </motion.button>
                  </Link>
                </motion.div>
              </div>
              <div className="w-full md:w-1/3">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6"
                >
                  <h2 className="text-lg font-semibold tracking-tighter mb-4 text-gray-900">Need help?</h2>
                  <ul className="space-y-3">
                    <li>
                      <a
                        href="/help"
                        className="text-gray-700 hover:text-[#FF0077] flex items-center justify-between font-light text-sm underline transition-colors"
                      >
                        When you&apos;ll get your payout <span>&gt;</span>
                      </a>
                    </li>
                    <li>
                      <a
                        href="/help"
                        className="text-gray-700 hover:text-[#FF0077] flex items-center justify-between font-light text-sm underline transition-colors"
                      >
                        How payouts work <span>&gt;</span>
                      </a>
                    </li>
                    <li>
                      <Link
                        href="/provider/finance"
                        className="text-gray-700 hover:text-[#FF0077] flex items-center justify-between font-light text-sm underline transition-colors"
                      >
                        Go to your transaction history <span>&gt;</span>
                      </Link>
                    </li>
                  </ul>
                </motion.div>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Add Payment Modal */}
      <AddPaymentModal isOpen={isModalOpen} onClose={handleCloseModal} onCardAdded={loadPaymentMethods} />
        </div>
      </div>
    </AuthGuard>
  );
};

export default PaymentPage;

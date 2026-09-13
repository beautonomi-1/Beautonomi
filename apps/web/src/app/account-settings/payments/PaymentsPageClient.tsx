"use client";
import React, { useState, useEffect, useRef } from "react";
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
import { useAuth } from "@/providers/AuthProvider";
import GiftCardsSection from "./components/GiftCardsSection";
import type { PaymentMethodRow, PaymentsPageInitial } from "./payments-initial-types";
import { useTranslation } from "@beautonomi/i18n";

type PaymentMethod = PaymentMethodRow;

const PaymentPage = ({ initial }: { initial: PaymentsPageInitial | null }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("payments");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [isRedeemingCoupon, setIsRedeemingCoupon] = useState(false);
  const [couponCount, setCouponCount] = useState(() => initial?.couponCount ?? 0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(
    () => initial?.paymentMethods ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const SAVE_CARD_INFO = t("web.accountSettings.payments.saveCardInfo");

  // Only show payouts tab for providers
  const isProvider = user?.role === "provider_owner" || user?.role === "provider_staff";

  const [paymentSafetyCopy, setPaymentSafetyCopy] = useState<{
    title: string;
    body: string;
    learn_more_url: string;
    learn_more_label: string;
  } | null>(() => initial?.paymentSafetyCopy ?? null);

  const skipHydrateLoadOnce = useRef(Boolean(initial));

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      return;
    }
    loadPaymentMethods();
    loadCouponCount();
    loadPaymentSafetyCopy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only load

  const loadPaymentSafetyCopy = async () => {
    try {
      const res = await fetcher.get<{ data: typeof paymentSafetyCopy }>(
        "/api/public/payment-safety-copy",
        { staleTimeMs: 60_000 }
      );
      if (res?.data) setPaymentSafetyCopy(res.data);
    } catch {
      // use fallback in render
    }
  };

  const loadCouponCount = async () => {
    try {
      const response = await fetcher.get<{ data: { count: number } }>("/api/me/coupons/count", {
        staleTimeMs: 30_000,
      });
      setCouponCount(response.data?.count || 0);
    } catch (error) {
      console.error("Failed to load coupon count:", error);
      // Don't show error, just default to 0
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error(t("web.accountSettings.payments.enterCouponCode"));
      return;
    }

    try {
      setIsRedeemingCoupon(true);
      await fetcher.post("/api/me/coupons/redeem", { code: couponCode.trim() });
      toast.success(t("web.accountSettings.payments.couponRedeemed"));
      setCouponCode("");
      setShowCouponInput(false);
      loadCouponCount();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("web.accountSettings.payments.couponRedeemFailed")
      );
    } finally {
      setIsRedeemingCoupon(false);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: PaymentMethod[] }>("/api/me/payment-methods", {
        staleTimeMs: 15_000,
      });
      setPaymentMethods(response.data || []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.accountSettings.payments.requestTimeout")
          : err instanceof FetchError
            ? err.message
            : t("web.accountSettings.payments.loadMethodsFailed");
      setError(errorMessage);
      console.error("Error loading payment methods:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
    if (!confirm(t("web.accountSettings.payments.removeConfirm"))) return;

    try {
      await fetcher.delete(`/api/me/payment-methods/${id}`);
      toast.success(t("web.accountSettings.payments.methodRemoved"));
      loadPaymentMethods();
    } catch (err) {
      toast.error(t("web.accountSettings.payments.removeFailed"));
      console.error("Error deleting payment method:", err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetcher.patch<{ data?: unknown; error?: { message?: string } }>(
        `/api/me/payment-methods/${id}`,
        { is_default: true }
      );
      if (res?.error) {
        toast.error(res.error.message || t("web.accountSettings.payments.setDefaultFailed"));
        return;
      }
      toast.success(t("web.accountSettings.payments.defaultCardUpdated"));
      loadPaymentMethods();
    } catch {
      toast.error(t("web.accountSettings.payments.setDefaultCardFailed"));
    }
  };

  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const res = await fetcher.post<{
        data?: { authorization_url?: string };
        error?: { message?: string };
      }>("/api/me/payment-methods/initialize-verification", {
        set_as_default: paymentMethods.length === 0,
      });
      const url = res?.data?.authorization_url;
      if (!url) {
        toast.error(res?.error?.message || t("web.accountSettings.payments.startVerificationFailed"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info(t("web.accountSettings.payments.completeVerification"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("web.accountSettings.payments.addCardFailed"));
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
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <BackButton href="/account-settings" />
        <Breadcrumb
          items={[{ label: t("web.accountSettings.payments.breadcrumbAccount"), href: "/account-settings" }, { label: t("web.accountSettings.payments.breadcrumbTitle") }]}
        />

        {/* Page Header - Glass Card Style */}
        <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900">
            {t("web.accountSettings.payments.title")}
          </h1>
          <p className="text-sm md:text-base text-gray-600 font-light">
            {t("web.accountSettings.payments.subtitle")}
          </p>
        </div>

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
                {t("web.accountSettings.payments.tabPayments")}
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
                  {t("web.accountSettings.payments.tabPayouts")}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="payments">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="w-full md:w-2/3">
                {/* Payment History Section */}
                <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6">
                  <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">
                    {t("web.accountSettings.payments.yourPayments")}
                  </h2>
                  <p className="text-base font-light mb-6 text-gray-600">
                    {t("web.accountSettings.payments.yourPaymentsDesc")}
                  </p>
                  <Link href="/account-settings/bookings">
                    <button
                      type="button"
                      className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl mb-6 md:mb-8 font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
                    >
                      {t("web.accountSettings.payments.viewBookingPayments")}
                    </button>
                  </Link>
                </div>

                {/* Payment Methods Section */}
                <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                      {t("web.accountSettings.payments.paymentMethods")}
                    </h2>
                    <button
                      type="button"
                      onClick={() => toast.info(SAVE_CARD_INFO, { duration: 8000 })}
                      className="p-1 rounded-full hover:bg-gray-100 text-[#FF0077]"
                      aria-label={t("web.accountSettings.payments.saveCardAria")}
                    >
                      <Info className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-base mb-3 font-light text-gray-600">
                    {SAVE_CARD_INFO}
                  </p>

                  {isLoading ? (
                    <div className="mb-6">
                      <LoadingTimeout loadingMessage={t("web.accountSettings.payments.loadingMethods")} />
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
                        {t("web.accountSettings.payments.retry")}
                      </Button>
                    </div>
                  ) : paymentMethods.length === 0 ? (
                    <div className="mb-6 p-6 border border-gray-200 rounded-xl text-center backdrop-blur-sm bg-white/60">
                      <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 mb-2 font-medium">{t("web.accountSettings.payments.noMethodsTitle")}</p>
                      <p className="text-sm text-gray-500 mb-4">
                        {t("web.accountSettings.payments.noMethodsDesc")}
                      </p>
                      <Link href="/">
                        <button
                          type="button"
                          className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
                        >
                          {t("web.accountSettings.payments.bookToSaveCard")}
                        </button>
                      </Link>
                    </div>
                  ) : (
                    <div className="mb-6 space-y-3">
                      {paymentMethods.map((method) => (
                        <div
                          key={method.id}
                          className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4 flex items-center justify-between hover:shadow-lg transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <CreditCard className="w-8 h-8 text-[#FF0077]" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900">
                                  {method.card_type
                                    ? method.card_type.charAt(0).toUpperCase() +
                                      method.card_type.slice(1)
                                    : t("web.accountSettings.payments.cardFallback")}
                                  {method.last4 && ` •••• ${method.last4}`}
                                </span>
                                {method.is_default ? (
                                  <span className="px-2 py-1 bg-gradient-to-r from-[#FF0077] to-[#E6006A] text-white text-xs rounded-full flex items-center gap-1">
                                    <Star className="w-3 h-3 fill-white" />
                                    {t("web.accountSettings.payments.default")}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSetDefault(method.id)}
                                    className="text-xs font-medium text-[#FF0077] hover:text-[#E6006A] underline"
                                  >
                                    {t("web.accountSettings.payments.setDefault")}
                                  </button>
                                )}
                              </div>
                              {method.cardholder_name && (
                                <p className="text-sm text-gray-600">{method.cardholder_name}</p>
                              )}
                              {method.expiry_month && method.expiry_year && (
                                <p
                                  className={`text-xs ${method.is_expired ? "font-semibold text-red-600" : "text-gray-500"}`}
                                >
                                  {method.is_expired ? t("web.accountSettings.payments.expired") : t("web.accountSettings.payments.expires")}{" "}
                                  {method.expiry_label ??
                                    `${String(method.expiry_month).padStart(2, "0")}/${String(method.expiry_year).slice(-2)}`}
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
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleAddCard}
                    disabled={addingCard}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#FF0077] text-gray-600 hover:text-[#FF0077] transition-all mt-3 disabled:opacity-60"
                  >
                    {addingCard ? (
                      <span className="text-sm font-medium">{t("web.accountSettings.payments.opening")}</span>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("web.accountSettings.payments.addCard")}</span>
                      </>
                    )}
                  </button>
                </div>

                <GiftCardsSection />

                {/* Coupons Section */}
                <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6">
                  <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">
                    {t("web.accountSettings.payments.coupons")}
                  </h2>
                  <div className="flex justify-between items-center mb-4 font-medium text-gray-700">
                    <span>{t("web.accountSettings.payments.yourCoupons")}</span>
                    <span className="text-[#FF0077] font-semibold">{couponCount}</span>
                  </div>

                  {!showCouponInput ? (
                    <button
                      type="button"
                      onClick={handleAddCouponClick}
                      className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
                    >
                      {t("web.accountSettings.payments.addCoupon")}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="py-2 relative border border-white/40 rounded-lg backdrop-blur-sm bg-white/60">
                        {focusField.coupon && (
                          <Label
                            htmlFor="coupon"
                            className="absolute top-1 left-3 text-xs text-gray-500"
                          >
                            {t("web.accountSettings.payments.couponCodeLabel")}
                          </Label>
                        )}
                        <Input
                          id="coupon"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder={!focusField.coupon ? t("web.accountSettings.payments.couponCodeLabel") : ""}
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
                          {isRedeemingCoupon ? t("web.accountSettings.payments.redeeming") : t("web.accountSettings.payments.redeemCoupon")}
                        </Button>
                        <Button
                          onClick={handleCancelCoupon}
                          variant="outline"
                          disabled={isRedeemingCoupon}
                        >
                          {t("web.accountSettings.payments.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar - Info Card (managed by superadmin) */}
              <div className="w-full md:w-1/3">
                <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 sticky top-6">
                  <div className="flex items-center mb-4">
                    <h2 className="text-lg font-semibold tracking-tighter text-gray-900">
                      {paymentSafetyCopy?.title ?? t("web.accountSettings.payments.safetyTitle")}
                    </h2>
                  </div>
                  <p className="mb-4 text-sm font-light text-gray-600 leading-relaxed">
                    {paymentSafetyCopy?.body ??
                      t("web.accountSettings.payments.safetyBody")}
                  </p>
                  <Link
                    href={paymentSafetyCopy?.learn_more_url ?? "/terms-and-condition"}
                    className="text-[#FF0077] hover:text-[#E6006A] text-sm font-medium underline transition-colors inline-flex items-center gap-1.5 group"
                  >
                    <span>{paymentSafetyCopy?.learn_more_label ?? t("web.accountSettings.payments.learnMore")}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          </TabsContent>

          {isProvider && (
            <TabsContent value="payouts">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="w-full md:w-2/3">
                  <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6">
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">
                      {t("web.accountSettings.payments.howYoullGetPaid")}
                    </h2>
                    <p className="text-base mb-6 font-light text-gray-600">
                      {t("web.accountSettings.payments.payoutSetupDesc")}
                    </p>
                    <Link href="/provider/settings/payout-accounts">
                      <button
                        type="button"
                        className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
                      >
                        {t("web.accountSettings.payments.setUpPayouts")}
                      </button>
                    </Link>
                  </div>
                </div>
                <div className="w-full md:w-1/3">
                  <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6">
                    <h2 className="text-lg font-semibold tracking-tighter mb-4 text-gray-900">
                      {t("web.accountSettings.payments.needHelp")}
                    </h2>
                    <ul className="space-y-3">
                      <li>
                        <a
                          href="/help"
                          className="text-gray-700 hover:text-[#FF0077] flex items-center justify-between font-light text-sm underline transition-colors"
                        >
                          {t("web.accountSettings.payments.whenYoullGetPayout")} <span>&gt;</span>
                        </a>
                      </li>
                      <li>
                        <a
                          href="/help"
                          className="text-gray-700 hover:text-[#FF0077] flex items-center justify-between font-light text-sm underline transition-colors"
                        >
                          {t("web.accountSettings.payments.howPayoutsWork")} <span>&gt;</span>
                        </a>
                      </li>
                      <li>
                        <Link
                          href="/provider/finance"
                          className="text-gray-700 hover:text-[#FF0077] flex items-center justify-between font-light text-sm underline transition-colors"
                        >
                          {t("web.accountSettings.payments.transactionHistory")} <span>&gt;</span>
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Add Payment Modal */}
        <AddPaymentModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onCardAdded={loadPaymentMethods}
        />
      </div>
    </div>
  );
};

export default PaymentPage;

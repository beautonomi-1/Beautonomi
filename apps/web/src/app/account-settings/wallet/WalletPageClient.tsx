"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import BackButton from "@/components/ui/back-button";
import Breadcrumb from "@/components/ui/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { Wallet, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import type { WalletData, WalletTx, WalletInitialPayload } from "./wallet-types";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

export default function WalletPage({
  initialWallet,
}: {
  initialWallet: WalletInitialPayload | null;
}) {
  const { t } = useTranslation();
  const { format } = usePlatformCurrency();
  const searchParams = useSearchParams();
  const [wallet, setWallet] = useState<WalletData | null>(() => initialWallet?.wallet ?? null);
  const [transactions, setTransactions] = useState<WalletTx[]>(() => initialWallet?.transactions ?? []);
  const [isLoading, setIsLoading] = useState(() => !initialWallet);
  const skipHydrateLoadOnce = useRef(Boolean(initialWallet));
  const [topupAmount, setTopupAmount] = useState<string>("");
  const [giftCardCode, setGiftCardCode] = useState<string>("");
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingGiftCards, setPendingGiftCards] = useState<
    Array<{ id: string; code: string; balance: number; currency: string }>
  >([]);
  const [claimingCode, setClaimingCode] = useState<string | null>(null);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: { wallet: WalletData; transactions: WalletTx[] } }>("/api/me/wallet", { staleTimeMs: 15_000 });
      setWallet(res.data.wallet);
      setTransactions(res.data.transactions || []);
    } catch (e) {
      toast.error(t("web.accountSettings.wallet.loadFailed"));
      console.error("Error loading wallet:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetcher.get<{ data: { wallet: WalletData; transactions: WalletTx[] } }>("/api/me/wallet", { staleTimeMs: 0 });
      setWallet(res.data.wallet);
      setTransactions(res.data.transactions || []);
      toast.success(t("web.accountSettings.wallet.refreshed"));
    } catch (e) {
      toast.error(t("web.accountSettings.wallet.refreshFailed"));
      console.error("Error refreshing wallet:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      return;
    }
    void load();
  }, []);

  // Prefill the gift card code when arriving from a redeem link (e.g. the email
  // we send a recipient: /account-settings/wallet?giftCode=GC-XXXX).
  useEffect(() => {
    const incoming = searchParams.get("giftCode");
    if (incoming && incoming.trim()) {
      setGiftCardCode(incoming.trim().toUpperCase());
    }
  }, [searchParams]);

  // Surface gift cards sent to this account's email that haven't been added to
  // the wallet yet, so the recipient can claim them in one tap on arrival.
  const loadPendingGiftCards = async () => {
    try {
      const res = await fetcher.get<{
        data?: { pending_gift_cards?: Array<{ id: string; code: string; balance: number; currency: string }> };
      }>("/api/me/profile", { staleTimeMs: 15_000 });
      setPendingGiftCards(res.data?.pending_gift_cards ?? []);
    } catch {
      setPendingGiftCards([]);
    }
  };

  useEffect(() => {
    void loadPendingGiftCards();
  }, []);

  const claimPendingGiftCard = async (code: string) => {
    if (!code) return;
    try {
      setClaimingCode(code);
      const res = await fetcher.post<{ data: { amount: number; currency: string; message: string } }>(
        "/api/me/wallet/redeem-gift-card",
        { code },
      );
      toast.success(res?.data?.message || t("web.accountSettings.wallet.giftCardAdded"));
      setPendingGiftCards((prev) => prev.filter((gc) => gc.code !== code));
      await refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("web.accountSettings.wallet.giftCardAddFailed");
      toast.error(message);
    } finally {
      setClaimingCode(null);
    }
  };

  const startTopup = async () => {
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) {
      toast.error(t("web.accountSettings.wallet.enterValidAmount"));
      return;
    }
    if (amount < 1) {
      toast.error(t("web.accountSettings.wallet.minTopUp"));
      return;
    }
    try {
      setIsToppingUp(true);
      const res = await fetcher.post<{ data: { payment_url?: string } }>("/api/me/wallet/topup", { amount });
      const url = res?.data?.payment_url;
      if (!url) {
        toast.error(t("web.accountSettings.wallet.paymentLinkMissing"));
        return;
      }
      window.location.href = url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("web.accountSettings.wallet.topUpFailed");
      toast.error(message);
      console.error("Error starting top up:", e);
    } finally {
      setIsToppingUp(false);
    }
  };

  const redeemGiftCard = async () => {
    if (!giftCardCode.trim()) {
      toast.error(t("web.accountSettings.wallet.enterGiftCardCode"));
      return;
    }
    try {
      setIsRedeeming(true);
      const res = await fetcher.post<{ data: { amount: number; currency: string; message: string } }>(
        "/api/me/wallet/redeem-gift-card",
        { code: giftCardCode }
      );
      toast.success(res?.data?.message || t("web.accountSettings.wallet.redeemSuccess"));
      setGiftCardCode("");
      await refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("web.accountSettings.wallet.redeemFailed");
      toast.error(message);
      console.error("Error redeeming gift card:", e);
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <Breadcrumb items={[{ label: t("web.accountSettings.wallet.home"), href: "/" }, { label: t("web.accountSettings.wallet.accountSettings"), href: "/account-settings" }, { label: t("web.accountSettings.wallet.title") }]} />
          <BackButton href="/account-settings" />

          <div
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">{t("web.accountSettings.wallet.title")}</h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-gray-500">{t("web.accountSettings.wallet.loading")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Available Balance Card */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                      <Wallet className="w-6 h-6 text-[#FF0077]" />
                    </div>
                    <h2 className="text-lg font-semibold tracking-tighter text-gray-900">{t("web.accountSettings.wallet.availableBalance")}</h2>
                  </div>
                  <div className="text-4xl md:text-5xl font-bold text-gray-900 mt-2">
                    {wallet ? format(Number(wallet.balance || 0)) : "—"}
                  </div>
                </div>

                {/* Pending gift cards — sent to this account's email, not yet redeemed */}
                {pendingGiftCards.length > 0 && (
                  <div className="rounded-2xl border border-[#FF0077]/30 bg-gradient-to-br from-[#FF0077]/5 to-[#E6006A]/5 p-6 md:p-8">
                    <h2 className="text-lg font-semibold tracking-tighter text-gray-900 mb-1">
                      🎁 {pendingGiftCards.length === 1
                        ? t("web.accountSettings.wallet.giftCardsWaitingOne")
                        : t("web.accountSettings.wallet.giftCardsWaitingMany", { count: pendingGiftCards.length })}
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                      {pendingGiftCards.length === 1
                        ? t("web.accountSettings.wallet.giftCardSentOne")
                        : t("web.accountSettings.wallet.giftCardSentMany")}
                    </p>
                    <div className="space-y-3">
                      {pendingGiftCards.map((gc) => (
                        <div
                          key={gc.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white/70 border border-white/50 px-4 py-3"
                        >
                          <div>
                            <div className="font-mono text-sm font-semibold text-gray-900">{gc.code}</div>
                            <div className="text-sm text-gray-600">{format(Number(gc.balance || 0))}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void claimPendingGiftCard(gc.code)}
                            disabled={claimingCode === gc.code}
                            className="whitespace-nowrap bg-gradient-to-r from-[#FF0077] to-[#E6006A] text-white px-5 py-2 rounded-xl font-semibold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {claimingCode === gc.code ? t("web.accountSettings.wallet.adding") : t("web.accountSettings.wallet.addToWallet")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Up Card */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-xl font-semibold tracking-tighter text-gray-900 mb-6">{t("web.accountSettings.wallet.topUpRedeem")}</h2>
                  
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="amount" className="text-sm font-medium text-gray-700 mb-2 block">
                          {t("web.accountSettings.wallet.topUpAmount")}
                        </Label>
                        <Input
                          id="amount"
                          type="number"
                          min="1"
                          step="0.01"
                          value={topupAmount}
                          onChange={(e) => setTopupAmount(e.target.value)}
                          placeholder={t("web.accountSettings.wallet.enterAmount")}
                          inputMode="decimal"
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40 text-base"
                        />
                      </div>
                      
                      <button
                        type="button"
                        onClick={startTopup}
                        disabled={isToppingUp || !topupAmount || Number(topupAmount) <= 0}
                        className="w-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isToppingUp ? (
                          <span>{t("web.accountSettings.wallet.processing")}</span>
                        ) : (
                          <>
                            <ArrowUpRight className="w-5 h-5" />
                            <span>{t("web.accountSettings.wallet.topUpWithCard")}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white/60 px-2 text-sm text-gray-500">{t("web.accountSettings.wallet.or")}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="giftcard" className="text-sm font-medium text-gray-700 mb-2 block">
                          {t("web.accountSettings.wallet.redeemGiftCard")}
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="giftcard"
                            type="text"
                            value={giftCardCode}
                            onChange={(e) => setGiftCardCode(e.target.value)}
                            placeholder={t("web.accountSettings.wallet.enterCode")}
                            className="w-full backdrop-blur-sm bg-white/60 border-white/40 text-base"
                          />
                          <button
                            type="button"
                            onClick={redeemGiftCard}
                            disabled={isRedeeming || !giftCardCode.trim()}
                            className="whitespace-nowrap bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2 rounded-xl font-semibold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRedeeming ? t("web.accountSettings.wallet.redeeming") : t("web.accountSettings.wallet.redeem")}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          {t("web.accountSettings.wallet.redeemHint")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity Card */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">{t("web.accountSettings.wallet.recentActivity")}</h2>
                    <button type="button"
                      onClick={refresh}
                      disabled={isRefreshing}
                      className="p-2 hover:bg-white/40 rounded-lg transition-colors disabled:opacity-50"
                      aria-label={t("web.accountSettings.wallet.refresh")}
                    >
                      <RefreshCw className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>

                  {transactions.length === 0 ? (
                    <EmptyState
                      icon={Wallet}
                      title={t("web.accountSettings.noWalletTransactions")}
                      description={t("web.accountSettings.wallet.noTransactionsDesc")}
                    />
                  ) : (
                    <div className="space-y-3">
                      {transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-4 bg-white/40 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/60 transition-colors"
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className={`p-2 rounded-lg ${
                              tx.type === "credit" 
                                ? "bg-green-100/50 text-green-700" 
                                : "bg-red-100/50 text-red-700"
                            }`}>
                              {tx.type === "credit" ? (
                                <ArrowDownRight className="w-5 h-5" />
                              ) : (
                                <ArrowUpRight className="w-5 h-5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {tx.description || (tx.type === "credit" ? t("web.accountSettings.wallet.credit") : t("web.accountSettings.wallet.debit"))}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {tx.reference_type && `${tx.reference_type} • `}
                                {new Date(tx.created_at).toLocaleDateString(getDefaultMoneyLocale(), {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                          <div className={`text-sm font-semibold ${
                            tx.type === "credit" ? "text-green-700" : "text-red-700"
                          }`}>
                            {tx.type === "credit" ? "+" : "-"}
                            {format(Number(tx.amount || 0))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
  );
}

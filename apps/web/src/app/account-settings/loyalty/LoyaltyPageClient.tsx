"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import BackButton from "@/components/ui/back-button";
import Breadcrumb from "@/components/ui/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { toast } from "sonner";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { Gift, Award, History, Sparkles, TrendingUp, CreditCard } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";
import type { LoyaltyPageData } from "./loyalty-page-types";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

type LoyaltyData = LoyaltyPageData;

export default function LoyaltyPage({
  initialLoyalty,
}: {
  initialLoyalty: LoyaltyPageData | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { format } = usePlatformCurrency();
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(() => initialLoyalty);
  const [isLoading, setIsLoading] = useState(() => initialLoyalty === null);
  const skipHydrateLoadOnce = useRef(initialLoyalty !== null);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: LoyaltyData }>("/api/me/loyalty", { staleTimeMs: 15_000 });
      setLoyaltyData(res.data);
    } catch (e) {
      toast.error(t("web.accountSettings.loyalty.loadFailed"));
      console.error("Error loading loyalty points:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setIsLoading(false);
      return;
    }
    void load();
  }, []);

  const historyLabel = (transaction: LoyaltyData["history"][number]) => {
    if (transaction.description) return transaction.description;
    if (transaction.transaction_type === "bonus") return t("web.accountSettings.loyalty.bonusPoints");
    if (transaction.transaction_type === "earned") return t("web.accountSettings.loyalty.pointsEarned");
    if (transaction.transaction_type === "redeemed") return t("web.accountSettings.loyalty.pointsRedeemed");
    if (transaction.transaction_type === "expired") return t("web.accountSettings.loyalty.pointsExpired");
    return t("web.accountSettings.loyalty.pointsAdjustment");
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <Breadcrumb 
            items={[
              { label: t("web.accountSettings.loyalty.breadcrumbHome"), href: "/" },
              { label: t("web.accountSettings.loyalty.breadcrumbAccountSettings"), href: "/account-settings" },
              { label: t("web.accountSettings.loyalty.title") }
            ]} 
          />
          <BackButton href="/account-settings" />

          <div
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              {t("web.accountSettings.loyalty.title")}
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-gray-500">{t("web.accountSettings.loyalty.loading")}</p>
              </div>
            ) : loyaltyData ? (
              <div className="space-y-6">
                {/* How you earn & How to redeem */}
                <div
                  className="backdrop-blur-2xl bg-white/80 border border-[#FF0077]/20 shadow-xl rounded-2xl p-5 md:p-6"
                >
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("web.accountSettings.loyalty.howRewardsWork")}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 p-2.5 rounded-lg bg-[#FF0077]/10 h-fit">
                        <TrendingUp className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 mb-1">{t("web.accountSettings.loyalty.howYouEarn")}</p>
                        <p className="text-sm text-gray-600">
                          {loyaltyData.points_per_currency_unit === 1
                            ? t("web.accountSettings.loyalty.howYouEarnOne", {
                                count: loyaltyData.points_per_currency_unit,
                                currency: loyaltyData.redemption_currency,
                              })
                            : t("web.accountSettings.loyalty.howYouEarnMany", {
                                count: loyaltyData.points_per_currency_unit,
                                currency: loyaltyData.redemption_currency,
                              })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 p-2.5 rounded-lg bg-[#FF0077]/10 h-fit">
                        <CreditCard className="w-5 h-5 text-[#FF0077]" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 mb-1">{t("web.accountSettings.loyalty.howYouRedeem")}</p>
                        <p className="text-sm text-gray-600">
                          {t("web.accountSettings.loyalty.howYouRedeemBody", {
                            rate: loyaltyData.redemption_rate,
                            currency: loyaltyData.redemption_currency,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Points Balance Card */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                      <Sparkles className="w-6 h-6 text-[#FF0077]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                        {t("web.accountSettings.loyalty.pointsBalance")}
                      </h2>
                      <p className="text-sm font-light text-gray-600 mt-1">
                        {t("web.accountSettings.loyalty.pointsBalanceHint")}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-6">
                      <p className="text-sm font-medium text-gray-600 mb-2">{t("web.accountSettings.loyalty.totalPoints")}</p>
                      <p className="text-4xl font-bold text-gray-900">
                        {loyaltyData.points_balance.toLocaleString()}
                      </p>
                    </div>
                    <div className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-6">
                      <p className="text-sm font-medium text-gray-600 mb-2">{t("web.accountSettings.loyalty.redemptionValue")}</p>
                      <p className="text-4xl font-bold text-gray-900">
                        {format(loyaltyData.redemption_value)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.accountSettings.loyalty.redemptionRate", {
                          rate: loyaltyData.redemption_rate,
                          currency: loyaltyData.redemption_currency,
                        })}
                      </p>
                    </div>
                  </div>
                  {loyaltyData.points_balance === 0 && (
                    <p className="mt-4 text-sm text-gray-600 bg-[#FF0077]/5 border border-[#FF0077]/20 rounded-xl p-4">
                      {t("web.accountSettings.loyalty.emptyBalanceHint")}
                    </p>
                  )}
                </div>

                {/* Next Milestone Card */}
                {loyaltyData.next_milestone && (
                  <div
                    className="backdrop-blur-2xl bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 border border-[#FF0077]/20 shadow-2xl rounded-2xl p-6 md:p-8"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <Award className="w-6 h-6 text-[#FF0077]" />
                      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                        {t("web.accountSettings.loyalty.nextMilestone")}
                      </h2>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">
                          {loyaltyData.next_milestone.name}
                        </p>
                        {loyaltyData.next_milestone.description && (
                          <p className="text-sm font-light text-gray-600 mt-1">
                            {loyaltyData.next_milestone.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{t("web.accountSettings.loyalty.progress")}</span>
                            <span className="text-gray-900 font-medium">
                              {t("web.accountSettings.loyalty.progressPoints", {
                                current: loyaltyData.points_balance,
                                threshold: loyaltyData.next_milestone.points_threshold,
                              })}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] h-2.5 rounded-full transition-all"
                              style={{
                                width: `${Math.min(
                                  (loyaltyData.points_balance / loyaltyData.next_milestone.points_threshold) * 100,
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-end">
                          <p className="text-sm font-medium text-gray-900">{t("web.accountSettings.loyalty.reward")}</p>
                          <p className="text-lg font-bold text-[#FF0077]">
                            {format(loyaltyData.next_milestone.reward_amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Available Milestones */}
                {loyaltyData.available_milestones.length > 0 && (
                  <div
                    className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                  >
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900 mb-6">
                      {t("web.accountSettings.loyalty.availableMilestones")}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {loyaltyData.available_milestones.map((milestone) => {
                        const isReached = loyaltyData.points_balance >= milestone.points_threshold;
                        return (
                          <div
                            key={milestone.id}
                            className={`backdrop-blur-sm border rounded-xl p-4 ${
                              isReached
                                ? "bg-green-50/60 border-green-200"
                                : "bg-white/60 border-white/40"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Award className={`w-5 h-5 ${isReached ? "text-green-600" : "text-gray-400"}`} />
                              <p className="font-semibold text-gray-900">{milestone.name}</p>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              {t("web.accountSettings.loyalty.milestonePoints", {
                                count: milestone.points_threshold,
                              })}
                            </p>
                            <p className="text-sm font-medium text-[#FF0077]">
                              {t("web.accountSettings.loyalty.rewardAmount", {
                                amount: format(milestone.reward_amount),
                              })}
                            </p>
                            {isReached && (
                              <p className="text-xs text-green-600 mt-2 font-medium">{t("web.accountSettings.loyalty.reached")}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Redeem Points Button */}
                {loyaltyData.points_balance > 0 && (
                  <div
                    className="backdrop-blur-2xl bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 border border-[#FF0077]/20 shadow-2xl rounded-2xl p-6 md:p-8"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold tracking-tighter text-gray-900 mb-2">
                          {t("web.accountSettings.loyalty.readyToRedeem")}
                        </h2>
                        <p className="text-sm font-light text-gray-600">
                          {t("web.accountSettings.loyalty.readyToRedeemHint")}
                        </p>
                      </div>
                      <Button
                        onClick={() => router.push("/account-settings/loyalty/redeem")}
                        className="bg-[#FF0077] hover:bg-[#D60565] text-white"
                      >
                        <Gift className="w-4 h-4 me-2" />
                        {t("web.accountSettings.loyalty.redeemPoints")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Points History */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <History className="w-6 h-6 text-[#FF0077]" />
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                      {t("web.accountSettings.loyalty.pointsHistory")}
                    </h2>
                  </div>

                  {loyaltyData.history.length === 0 ? (
                    <EmptyState
                      icon={History}
                      title={t("web.accountSettings.noPointsHistory")}
                      description={t("web.accountSettings.loyalty.noHistoryDesc")}
                    />
                  ) : (
                    <div className="space-y-3">
                      {loyaltyData.history.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between p-4 bg-white/40 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/60 transition-colors"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {historyLabel(transaction)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(transaction.created_at).toLocaleDateString(getDefaultMoneyLocale(), {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div
                            className={`text-sm font-semibold ${
                              transaction.points >= 0 ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {transaction.points >= 0 ? "+" : "-"}
                            {t("web.accountSettings.loyalty.pointsAbbrev", {
                              points: Math.abs(transaction.points).toLocaleString(),
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Gift}
                title={t("web.accountSettings.unableLoadLoyalty")}
                description={t("web.accountSettings.loyalty.unableLoadDesc")}
                action={{
                  label: t("web.accountSettings.loyalty.retry"),
                  onClick: load,
                }}
              />
            )}
          </div>
        </div>
        <BottomNav />
      </div>
  );
}

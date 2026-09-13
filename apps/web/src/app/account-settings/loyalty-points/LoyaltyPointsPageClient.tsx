"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Star,
  TrendingUp,
  Gift,
  Calendar,
  ArrowUp,
  ArrowDown,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { formatCurrency } from "@/lib/pricing/calculate-booking-price-complete";
import type { LoyaltyPointsPageData, LoyaltyPointsTransaction } from "./loyalty-points-page-types";

type LoyaltyData = LoyaltyPointsPageData;
type LoyaltyTransaction = LoyaltyPointsTransaction;

export default function LoyaltyPointsPage({
  initialLoyaltyPoints,
}: {
  initialLoyaltyPoints: LoyaltyPointsPageData | null;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(() => initialLoyaltyPoints === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(() => initialLoyaltyPoints);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const skipHydrateLoadOnce = useRef(initialLoyaltyPoints !== null);

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setLoading(false);
      return;
    }
    void fetchLoyaltyData();
  }, []);

  const fetchLoyaltyData = async () => {
    try {
      const response = await fetch("/api/me/loyalty-points", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: LoyaltyData };
      const payload = body?.data ?? (body as unknown as LoyaltyData);
      if (payload && typeof payload === "object" && "balance" in payload) {
        setLoyaltyData(payload);
      } else {
        setLoyaltyData(null);
      }
    } catch (error) {
      console.error("Failed to fetch loyalty points:", error);
      toast.error(t("web.accountSettings.loyaltyPoints.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = async () => {
    try {
      const res = await fetch("/api/me/referrals", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { referral_link?: string; referral_code?: string };
        referral_link?: string;
        referral_code?: string;
      };
      const data = body.data ?? body;
      const referralLink =
        data.referral_link ||
        (data.referral_code ? `${window.location.origin}/signup?ref=${encodeURIComponent(data.referral_code)}` : "");
      if (!referralLink) {
        toast.error(t("web.accountSettings.loyaltyPoints.referralLoadFailed"));
        return;
      }
      await navigator.clipboard.writeText(referralLink);
      setCopiedReferral(true);
      toast.success(t("web.accountSettings.loyaltyPoints.referralCopied"));
      setTimeout(() => setCopiedReferral(false), 2000);
    } catch {
      toast.error(t("web.accountSettings.loyaltyPoints.referralCopyFailed"));
    }
  };

  const loadMoreTransactions = async () => {
    if (!loyaltyData || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextOffset = loyaltyData.pagination.offset + loyaltyData.pagination.limit;
      const params = new URLSearchParams({
        limit: String(loyaltyData.pagination.limit),
        offset: String(nextOffset),
      });
      const response = await fetch(`/api/me/loyalty-points?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { data?: LoyaltyData };
      const payload = body?.data ?? (body as unknown as LoyaltyData);
      if (payload && typeof payload === "object" && Array.isArray(payload.recent_transactions)) {
        setLoyaltyData((prev) =>
          prev
            ? {
                ...payload,
                recent_transactions: [
                  ...prev.recent_transactions,
                  ...payload.recent_transactions.filter(
                    (tx) => !prev.recent_transactions.some((existing) => existing.id === tx.id),
                  ),
                ],
              }
            : payload,
        );
      }
    } catch (error) {
      console.error("Failed to load more loyalty transactions:", error);
      toast.error(t("web.accountSettings.loyaltyPoints.loadMoreFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "earned":
      case "earn":
        return <ArrowUp className="w-5 h-5 text-green-600" />;
      case "redeemed":
      case "redeem":
        return <ArrowDown className="w-5 h-5 text-red-600" />;
      case "bonus":
        return <Gift className="w-5 h-5 text-purple-600" />;
      case "expired":
      case "expire":
        return <Calendar className="w-5 h-5 text-gray-400" />;
      default:
        return <Star className="w-5 h-5 text-blue-600" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-500">{t("web.accountSettings.loyaltyPoints.loading")}</p>
      </div>
    );
  }

  if (!loyaltyData) {
    return null;
  }

  const progressToNextTier = Math.min((loyaltyData.balance.total_earned / 2000) * 100, 100);
  const pointsToNextTier = Math.max(2000 - loyaltyData.balance.total_earned, 0);

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("web.accountSettings.loyaltyPoints.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("web.accountSettings.loyaltyPoints.subtitle")}
        </p>
      </div>

      {/* Points Balance Card */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
            {t("web.accountSettings.loyaltyPoints.yourBalance")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-4">
            <div className="text-6xl font-bold text-primary mb-2">
              {loyaltyData.balance.available.toLocaleString()}
            </div>
            <p className="text-muted-foreground">{t("web.accountSettings.loyaltyPoints.availablePoints")}</p>
            <p className="text-2xl font-semibold text-green-600 mt-2">
              {t("web.accountSettings.loyaltyPoints.inDiscounts", {
                amount: formatCurrency(loyaltyData.conversion.can_redeem_amount, loyaltyData.conversion.currency),
              })}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-background/60 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">{t("web.accountSettings.loyaltyPoints.totalEarned")}</p>
              <p className="text-2xl font-bold text-green-600">
                {loyaltyData.balance.total_earned.toLocaleString()}
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">{t("web.accountSettings.loyaltyPoints.totalRedeemed")}</p>
              <p className="text-2xl font-bold text-blue-600">
                {loyaltyData.balance.total_redeemed.toLocaleString()}
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">{t("web.accountSettings.loyaltyPoints.conversionRate")}</p>
              <p className="text-lg font-semibold">
                {loyaltyData.conversion.display}
              </p>
            </div>
          </div>

          {/* Progress to Next Tier */}
          <div className="bg-background/60 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold">{t("web.accountSettings.loyaltyPoints.nextTierPlatinum")}</p>
              <Badge variant="secondary">{Math.round(progressToNextTier)}%</Badge>
            </div>
            <Progress value={progressToNextTier} className="h-3 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("web.accountSettings.loyaltyPoints.earnMoreForPlatinum", {
                amount: pointsToNextTier.toLocaleString(),
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>{t("web.accountSettings.loyaltyPoints.howItWorks")}</CardTitle>
          <CardDescription>
            {t("web.accountSettings.loyaltyPoints.howItWorksDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                {t("web.accountSettings.loyaltyPoints.earningPoints")}
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Star className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <span>
                    {t("web.accountSettings.loyaltyPoints.earnPerSpent", {
                      rate: loyaltyData.config.earning_rate,
                      amount: formatCurrency(1, loyaltyData.conversion.currency),
                    })}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Gift className="w-4 h-4 text-purple-500 mt-0.5" />
                  <span>{t("web.accountSettings.loyaltyPoints.firstBookingBonus")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-blue-500 mt-0.5" />
                  <span>{t("web.accountSettings.loyaltyPoints.birthdayBonus")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-green-500 mt-0.5" />
                  <span>{t("web.accountSettings.loyaltyPoints.referralBonus")}</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Gift className="w-5 h-5 text-blue-600" />
                {t("web.accountSettings.loyaltyPoints.redeemingPoints")}
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>
                    {t("web.accountSettings.loyaltyPoints.pointsEqualDiscount", {
                      rate: loyaltyData.conversion.rate,
                      amount: formatCurrency(1, loyaltyData.conversion.currency),
                    })}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>
                    {t("web.accountSettings.loyaltyPoints.minRedemption", {
                      count: loyaltyData.config.min_redemption_points,
                    })}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>
                    {t("web.accountSettings.loyaltyPoints.maxRedemption", {
                      percent: loyaltyData.config.max_redemption_percentage,
                    })}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-orange-500 mt-0.5" />
                  <span>
                    {t("web.accountSettings.loyaltyPoints.pointsExpire", {
                      days: loyaltyData.config.points_expiry_days,
                    })}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral Program */}
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-transparent dark:from-purple-950/20 dark:border-purple-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-600" />
            {t("web.accountSettings.loyaltyPoints.inviteTitle")}
          </CardTitle>
          <CardDescription>
            {t("web.accountSettings.loyaltyPoints.inviteDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button onClick={copyReferralLink} className="gap-2">
              {copiedReferral ? (
                <>
                  <Check className="w-4 h-4" />
                  {t("web.accountSettings.loyaltyPoints.copied")}
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  {t("web.accountSettings.loyaltyPoints.copyReferralLink")}
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("web.accountSettings.loyaltyPoints.shareAndEarn")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>{t("web.accountSettings.loyaltyPoints.recentActivity")}</CardTitle>
          <CardDescription>
            {t("web.accountSettings.loyaltyPoints.recentActivityDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loyaltyData.recent_transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t("web.accountSettings.loyaltyPoints.noTransactions")}</p>
                <p className="text-sm">{t("web.accountSettings.loyaltyPoints.noTransactionsHint")}</p>
              </div>
            ) : (
              loyaltyData.recent_transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getTransactionIcon(transaction.type)}
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatDate(transaction.created_at)}</span>
                        {transaction.booking_ref && (
                          <>
                            <span>•</span>
                            <span>{t("web.accountSettings.loyaltyPoints.bookingRef", { ref: transaction.booking_ref })}</span>
                          </>
                        )}
                        {transaction.expires_at && (
                          <>
                            <span>•</span>
                            <span>
                              {t("web.accountSettings.loyaltyPoints.expiresOn", {
                                date: formatDate(transaction.expires_at),
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-end">
                    <p
                      className={`text-lg font-bold ${
                        transaction.points > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {transaction.points > 0 ? "+" : ""}
                      {transaction.points.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {typeof transaction.balance_after === "number"
                        ? t("web.accountSettings.loyaltyPoints.balanceAfter", {
                            amount: transaction.balance_after.toLocaleString(),
                          })
                        : null}
                    </p>
                  </div>
                </div>
              ))
            )}

            {loyaltyData.pagination.has_more && (
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={loadMoreTransactions} disabled={loadingMore}>
                  {loadingMore
                    ? t("web.accountSettings.loyaltyPoints.loadingMore")
                    : t("web.accountSettings.loyaltyPoints.loadMore")}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-950/20">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">{t("web.accountSettings.loyaltyPoints.proTips")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-blue-900 dark:text-blue-100">
            <li>• {t("web.accountSettings.loyaltyPoints.tipBookRegularly")}</li>
            <li>• {t("web.accountSettings.loyaltyPoints.tipCombine")}</li>
            <li>
              •{" "}
              {t("web.accountSettings.loyaltyPoints.tipDontExpire", {
                days: loyaltyData.config.points_expiry_days,
              })}
            </li>
            <li>• {t("web.accountSettings.loyaltyPoints.tipShareSocial")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

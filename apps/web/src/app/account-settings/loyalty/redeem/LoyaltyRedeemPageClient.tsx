"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { useEffect, useRef, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import BackButton from "../../components/back-button";
import Breadcrumb from "../../components/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { toast } from "sonner";
import { Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useRouter } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LoyaltyPageData } from "../loyalty-page-types";

export default function LoyaltyRedeemPageClient({
  initialLoyalty,
}: {
  initialLoyalty: LoyaltyPageData | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const { format } = usePlatformCurrency();
  const [pointsBalance, setPointsBalance] = useState(() => initialLoyalty?.points_balance ?? 0);
  const [redemptionRate, setRedemptionRate] = useState(() => initialLoyalty?.redemption_rate ?? 100);
  const [currency, setCurrency] = useState(() => initialLoyalty?.redemption_currency ?? tenantCurrency);
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [isLoading, setIsLoading] = useState(() => initialLoyalty === null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const skipHydrateLoadOnce = useRef(initialLoyalty !== null);

  useEffect(() => {
    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setIsLoading(false);
      return;
    }
    void loadLoyaltyData();
  }, []);

  const loadLoyaltyData = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{
        data: {
          points_balance: number;
          redemption_rate: number;
          redemption_currency: string;
        };
      }>("/api/me/loyalty", { staleTimeMs: 15_000 });
      setPointsBalance(response.data.points_balance);
      setRedemptionRate(response.data.redemption_rate);
      setCurrency(response.data.redemption_currency);
    } catch (error) {
      console.error("Failed to load loyalty data:", error);
      toast.error(t("web.accountSettings.loyalty.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const calculateRedemptionValue = (points: number) => {
    return points / redemptionRate;
  };

  const handleRedeem = async () => {
    const points = parseInt(pointsToRedeem);
    if (!points || points < 1) {
      toast.error(t("web.accountSettings.loyalty.redeemPage.invalidPoints"));
      return;
    }

    if (points > pointsBalance) {
      toast.error(t("web.accountSettings.loyalty.redeemPage.notEnoughPoints"));
      return;
    }

    try {
      setIsRedeeming(true);
      const response = await fetcher.post<{
        data: {
          points_redeemed: number;
          redemption_value: number;
          currency: string;
          new_balance: number;
        };
      }>("/api/me/loyalty/redeem", {
        points,
        description: t("web.accountSettings.loyalty.redeemPage.apiDescription", { points }),
      });

      toast.success(
        t("web.accountSettings.loyalty.redeemPage.success", {
          points,
          amount: format(response.data.redemption_value),
        })
      );
      setPointsToRedeem("");
      loadLoyaltyData();
      router.push("/account-settings/loyalty");
    } catch (error: unknown) {
      console.error("Failed to redeem points:", error);
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loyalty.redeemPage.redeemFailed"));
    } finally {
      setIsRedeeming(false);
    }
  };

  const redemptionValue = pointsToRedeem
    ? calculateRedemptionValue(parseInt(pointsToRedeem) || 0)
    : 0;

  return (
    <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-2xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <BackButton href="/account-settings/loyalty" />
          <Breadcrumb
            items={[
              { label: t("web.accountSettings.loyalty.breadcrumbHome"), href: "/" },
              { label: t("web.accountSettings.loyalty.breadcrumbAccountSettings"), href: "/account-settings" },
              { label: t("web.accountSettings.loyalty.title"), href: "/account-settings/loyalty" },
              { label: t("web.accountSettings.loyalty.redeemPage.breadcrumbRedeem") },
            ]}
          />

          <div
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              {t("web.accountSettings.loyalty.redeemPage.title")}
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-gray-500">{t("web.accountSettings.loyalty.loading")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      {t("web.accountSettings.loyalty.pointsBalance")}
                    </CardTitle>
                    <CardDescription>
                      {t("web.accountSettings.loyalty.redemptionRate", {
                        rate: redemptionRate,
                        currency,
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold text-gray-900">
                      {t("web.accountSettings.loyalty.milestonePoints", {
                        count: pointsBalance,
                      })}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      {t("web.accountSettings.loyalty.redeemPage.worthApproximately", {
                        amount: format(pointsBalance / redemptionRate),
                      })}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("web.accountSettings.loyalty.redeemPoints")}</CardTitle>
                    <CardDescription>
                      {t("web.accountSettings.loyalty.redeemPage.formHint")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="points">{t("web.accountSettings.loyalty.redeemPage.pointsToRedeem")}</Label>
                      <Input
                        id="points"
                        type="number"
                        min="1"
                        max={pointsBalance}
                        value={pointsToRedeem}
                        onChange={(e) => setPointsToRedeem(e.target.value)}
                        placeholder={t("web.accountSettings.loyalty.redeemPage.pointsPlaceholder")}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.accountSettings.loyalty.redeemPage.maximumPoints", {
                          count: pointsBalance,
                        })}
                      </p>
                    </div>

                    {pointsToRedeem && parseInt(pointsToRedeem) > 0 && (
                      <div className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">
                            {t("web.accountSettings.loyalty.redeemPage.youWillReceive")}
                          </span>
                          <span className="text-2xl font-bold text-primary">
                            {format(redemptionValue)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {t("web.accountSettings.loyalty.redeemPage.formula", {
                            points: parseInt(pointsToRedeem) || 0,
                            rate: redemptionRate,
                            value: redemptionValue.toFixed(2),
                            currency,
                          })}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => router.back()}
                        className="flex-1"
                      >
                        {t("web.accountSettings.loyalty.redeemPage.cancel")}
                      </Button>
                      <Button
                        onClick={handleRedeem}
                        disabled={
                          isRedeeming ||
                          !pointsToRedeem ||
                          parseInt(pointsToRedeem) < 1 ||
                          parseInt(pointsToRedeem) > pointsBalance
                        }
                        className="flex-1 bg-primary hover:bg-primary-hover"
                      >
                        {isRedeeming ? (
                          t("web.accountSettings.loyalty.redeemPage.redeeming")
                        ) : (
                          <>
                            <Gift className="w-4 h-4 me-2" />
                            {t("web.accountSettings.loyalty.redeemPoints")}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
  );
}

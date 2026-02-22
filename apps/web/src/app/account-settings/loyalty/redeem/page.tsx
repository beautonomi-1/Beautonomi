"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import BackButton from "../../components/back-button";
import Breadcrumb from "../../components/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Gift, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoyaltyRedeemPage() {
  const router = useRouter();
  const { format } = usePlatformCurrency();
  const [pointsBalance, setPointsBalance] = useState(0);
  const [redemptionRate, setRedemptionRate] = useState(100);
  const [currency, setCurrency] = useState("ZAR");
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    loadLoyaltyData();
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
      }>("/api/me/loyalty", { cache: "no-store" });
      setPointsBalance(response.data.points_balance);
      setRedemptionRate(response.data.redemption_rate);
      setCurrency(response.data.redemption_currency);
    } catch (error) {
      console.error("Failed to load loyalty data:", error);
      toast.error("Failed to load loyalty points");
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
      toast.error("Please enter a valid number of points");
      return;
    }

    if (points > pointsBalance) {
      toast.error("You don't have enough points");
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
        description: `Redeemed ${points} loyalty points`,
      });

      toast.success(
        `Successfully redeemed ${points} points for ${format(response.data.redemption_value)}`
      );
      setPointsToRedeem("");
      loadLoyaltyData();
      router.push("/account-settings/loyalty");
    } catch (error: any) {
      console.error("Failed to redeem points:", error);
      toast.error(error.message || "Failed to redeem points");
    } finally {
      setIsRedeeming(false);
    }
  };

  const redemptionValue = pointsToRedeem
    ? calculateRedemptionValue(parseInt(pointsToRedeem) || 0)
    : 0;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-2xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <BackButton href="/account-settings/loyalty" />
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Account Settings", href: "/account-settings" },
              { label: "Loyalty Points", href: "/account-settings/loyalty" },
              { label: "Redeem Points" },
            ]}
          />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              Redeem Loyalty Points
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#FF0077] animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Points Balance Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-[#FF0077]" />
                      Your Points Balance
                    </CardTitle>
                    <CardDescription>
                      {redemptionRate} points = 1 {currency}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold text-gray-900">
                      {pointsBalance.toLocaleString()} points
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Worth approximately {format(pointsBalance / redemptionRate)}
                    </p>
                  </CardContent>
                </Card>

                {/* Redemption Form */}
                <Card>
                  <CardHeader>
                    <CardTitle>Redeem Points</CardTitle>
                    <CardDescription>
                      Convert your loyalty points into wallet credit
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="points">Points to Redeem</Label>
                      <Input
                        id="points"
                        type="number"
                        min="1"
                        max={pointsBalance}
                        value={pointsToRedeem}
                        onChange={(e) => setPointsToRedeem(e.target.value)}
                        placeholder="Enter points to redeem"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Maximum: {pointsBalance.toLocaleString()} points
                      </p>
                    </div>

                    {pointsToRedeem && parseInt(pointsToRedeem) > 0 && (
                      <div className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">
                            You will receive:
                          </span>
                          <span className="text-2xl font-bold text-[#FF0077]">
                            {format(redemptionValue)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {parseInt(pointsToRedeem) || 0} points ÷ {redemptionRate} ={" "}
                          {redemptionValue.toFixed(2)} {currency}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => router.back()}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleRedeem}
                        disabled={
                          isRedeeming ||
                          !pointsToRedeem ||
                          parseInt(pointsToRedeem) < 1 ||
                          parseInt(pointsToRedeem) > pointsBalance
                        }
                        className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
                      >
                        {isRedeeming ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Redeeming...
                          </>
                        ) : (
                          <>
                            <Gift className="w-4 h-4 mr-2" />
                            Redeem Points
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}

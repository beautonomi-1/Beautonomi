"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
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
import { formatCurrency } from "@/lib/pricing/calculate-booking-price-complete";

interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  balance_after: number;
  description: string;
  booking_ref?: string;
  expires_at?: string;
  created_at: string;
}

interface LoyaltyData {
  balance: {
    available: number;
    total_earned: number;
    total_redeemed: number;
    last_transaction_at?: string;
  };
  conversion: {
    rate: number;
    display: string;
    can_redeem_amount: number;
    currency: string;
  };
  config: {
    min_redemption_points: number;
    max_redemption_percentage: number;
    points_expiry_days: number;
    earning_rate: number;
  };
  recent_transactions: LoyaltyTransaction[];
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export default function LoyaltyPointsPage() {
  const [loading, setLoading] = useState(true);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);

  useEffect(() => {
    fetchLoyaltyData();
  }, []);

  const fetchLoyaltyData = async () => {
    try {
      const response = await fetch("/api/me/loyalty-points", { cache: "no-store" });
      const data = await response.json();
      setLoyaltyData(data);
    } catch (error) {
      console.error("Failed to fetch loyalty points:", error);
      toast.error("Failed to load loyalty points data");
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = () => {
    const referralLink = `${window.location.origin}/signup?ref=YOUR_CODE`;
    navigator.clipboard.writeText(referralLink);
    setCopiedReferral(true);
    toast.success("Referral link copied to clipboard");
    setTimeout(() => setCopiedReferral(false), 2000);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "earned":
        return <ArrowUp className="w-5 h-5 text-green-600" />;
      case "redeemed":
        return <ArrowDown className="w-5 h-5 text-red-600" />;
      case "bonus":
        return <Gift className="w-5 h-5 text-purple-600" />;
      case "expired":
        return <Calendar className="w-5 h-5 text-gray-400" />;
      default:
        return <Star className="w-5 h-5 text-blue-600" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
        <h1 className="text-3xl font-bold">Loyalty Points</h1>
        <p className="text-muted-foreground mt-2">
          Earn points with every booking and redeem them for discounts
        </p>
      </div>

      {/* Points Balance Card */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
            Your Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-4">
            <div className="text-6xl font-bold text-primary mb-2">
              {loyaltyData.balance.available.toLocaleString()}
            </div>
            <p className="text-muted-foreground">Available Points</p>
            <p className="text-2xl font-semibold text-green-600 mt-2">
              = {formatCurrency(loyaltyData.conversion.can_redeem_amount, loyaltyData.conversion.currency)} in discounts
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-background/60 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Earned</p>
              <p className="text-2xl font-bold text-green-600">
                {loyaltyData.balance.total_earned.toLocaleString()}
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Redeemed</p>
              <p className="text-2xl font-bold text-blue-600">
                {loyaltyData.balance.total_redeemed.toLocaleString()}
              </p>
            </div>
            <div className="bg-background/60 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Conversion Rate</p>
              <p className="text-lg font-semibold">
                {loyaltyData.conversion.display}
              </p>
            </div>
          </div>

          {/* Progress to Next Tier */}
          <div className="bg-background/60 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold">Next Tier: Platinum</p>
              <Badge variant="secondary">{Math.round(progressToNextTier)}%</Badge>
            </div>
            <Progress value={progressToNextTier} className="h-3 mb-2" />
            <p className="text-sm text-muted-foreground">
              Earn {pointsToNextTier.toLocaleString()} more points to unlock Platinum benefits
            </p>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How Loyalty Points Work</CardTitle>
          <CardDescription>
            Understanding the loyalty program
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Earning Points
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Star className="w-4 h-4 text-yellow-500 mt-0.5" />
                  <span>Earn <strong>{loyaltyData.config.earning_rate} point</strong> per {formatCurrency(1, loyaltyData.conversion.currency)} spent</span>
                </li>
                <li className="flex items-start gap-2">
                  <Gift className="w-4 h-4 text-purple-500 mt-0.5" />
                  <span><strong>2x points</strong> on your first booking</span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-blue-500 mt-0.5" />
                  <span><strong>50 bonus points</strong> on your birthday</span>
                </li>
                <li className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-green-500 mt-0.5" />
                  <span><strong>100 bonus points</strong> for each successful referral</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Gift className="w-5 h-5 text-blue-600" />
                Redeeming Points
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5" />
                  <span><strong>{loyaltyData.conversion.rate} points</strong> = {formatCurrency(1, loyaltyData.conversion.currency)} discount</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Minimum redemption: <strong>{loyaltyData.config.min_redemption_points} points</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5" />
                  <span>Maximum: <strong>{loyaltyData.config.max_redemption_percentage}% of booking</strong> can be paid with points</span>
                </li>
                <li className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-orange-500 mt-0.5" />
                  <span>Points expire after <strong>{loyaltyData.config.points_expiry_days} days</strong></span>
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
            Invite Friends, Earn More Points
          </CardTitle>
          <CardDescription>
            Get 100 bonus points for each friend who signs up and completes their first booking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button onClick={copyReferralLink} className="gap-2">
              {copiedReferral ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Referral Link
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Share your link and start earning!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Your latest points transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loyaltyData.recent_transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No transactions yet</p>
                <p className="text-sm">Make your first booking to start earning points!</p>
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
                            <span>Booking #{transaction.booking_ref}</span>
                          </>
                        )}
                        {transaction.expires_at && (
                          <>
                            <span>•</span>
                            <span>Expires {formatDate(transaction.expires_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-lg font-bold ${
                        transaction.points > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {transaction.points > 0 ? "+" : ""}
                      {transaction.points.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Balance: {transaction.balance_after.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}

            {loyaltyData.pagination.has_more && (
              <div className="text-center">
                <Button variant="outline" size="sm">
                  Load More
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-950/20">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">💡 Pro Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-blue-900 dark:text-blue-100">
            <li>• Book regularly to maximize your point earning potential</li>
            <li>• Combine points with membership discounts and promo codes for maximum savings</li>
            <li>• Don&apos;t let your points expire! Use them within {loyaltyData.config.points_expiry_days} days</li>
            <li>• Share your referral link on social media to earn bonus points</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

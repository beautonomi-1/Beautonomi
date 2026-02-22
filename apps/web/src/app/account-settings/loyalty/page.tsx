"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import AuthGuard from "@/components/auth/auth-guard";
import BackButton from "@/components/ui/back-button";
import Breadcrumb from "@/components/ui/breadcrumb";
import BottomNav from "@/components/layout/bottom-nav";
import { toast } from "sonner";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { motion } from "framer-motion";
import { Gift, Award, History, Loader2, Sparkles } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

interface LoyaltyData {
  points_balance: number;
  redemption_value: number;
  redemption_currency: string;
  redemption_rate: number;
  points_per_currency_unit: number;
  next_milestone: {
    id: string;
    name: string;
    description?: string | null;
    points_threshold: number;
    reward_type: string;
    reward_amount: number;
    reward_currency: string;
  } | null;
  available_milestones: Array<{
    id: string;
    name: string;
    description?: string | null;
    points_threshold: number;
    reward_type: string;
    reward_amount: number;
    reward_currency: string;
  }>;
  history: Array<{
    id: string;
    points: number;
    transaction_type: string;
    description?: string | null;
    created_at: string;
  }>;
}

export default function LoyaltyPage() {
  const router = useRouter();
  const { format } = usePlatformCurrency();
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: LoyaltyData }>("/api/me/loyalty", { cache: "no-store" });
      setLoyaltyData(res.data);
    } catch (e) {
      toast.error("Failed to load loyalty points");
      console.error("Error loading loyalty points:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <Breadcrumb 
            items={[
              { label: "Home", href: "/" },
              { label: "Account Settings", href: "/account-settings" },
              { label: "Loyalty Points" }
            ]} 
          />
          <BackButton href="/account-settings" />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              Loyalty Points
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#FF0077] animate-spin" />
              </div>
            ) : loyaltyData ? (
              <div className="space-y-6">
                {/* Points Balance Card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                      <Sparkles className="w-6 h-6 text-[#FF0077]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                        Your Points Balance
                      </h2>
                      <p className="text-sm font-light text-gray-600 mt-1">
                        Earn points with every booking and redeem them for rewards
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-6">
                      <p className="text-sm font-medium text-gray-600 mb-2">Total Points</p>
                      <p className="text-4xl font-bold text-gray-900">
                        {loyaltyData.points_balance.toLocaleString()}
                      </p>
                    </div>
                    <div className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-6">
                      <p className="text-sm font-medium text-gray-600 mb-2">Redemption Value</p>
                      <p className="text-4xl font-bold text-gray-900">
                        {format(loyaltyData.redemption_value)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {loyaltyData.redemption_rate} points = 1 {loyaltyData.redemption_currency}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Next Milestone Card */}
                {loyaltyData.next_milestone && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="backdrop-blur-2xl bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 border border-[#FF0077]/20 shadow-2xl rounded-2xl p-6 md:p-8"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <Award className="w-6 h-6 text-[#FF0077]" />
                      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                        Next Milestone
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
                            <span className="text-gray-600">Progress</span>
                            <span className="text-gray-900 font-medium">
                              {loyaltyData.points_balance} / {loyaltyData.next_milestone.points_threshold} points
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
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">Reward</p>
                          <p className="text-lg font-bold text-[#FF0077]">
                            {format(loyaltyData.next_milestone.reward_amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Available Milestones */}
                {loyaltyData.available_milestones.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                  >
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900 mb-6">
                      Available Milestones
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
                              {milestone.points_threshold} points
                            </p>
                            <p className="text-sm font-medium text-[#FF0077]">
                              Reward: {format(milestone.reward_amount)}
                            </p>
                            {isReached && (
                              <p className="text-xs text-green-600 mt-2 font-medium">✓ Reached</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* Redeem Points Button */}
                {loyaltyData.points_balance > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="backdrop-blur-2xl bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 border border-[#FF0077]/20 shadow-2xl rounded-2xl p-6 md:p-8"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold tracking-tighter text-gray-900 mb-2">
                          Ready to Redeem?
                        </h2>
                        <p className="text-sm font-light text-gray-600">
                          Convert your points into wallet credit for future bookings
                        </p>
                      </div>
                      <Button
                        onClick={() => router.push("/account-settings/loyalty/redeem")}
                        className="bg-[#FF0077] hover:bg-[#D60565] text-white"
                      >
                        <Gift className="w-4 h-4 mr-2" />
                        Redeem Points
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Points History */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <History className="w-6 h-6 text-[#FF0077]" />
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                      Points History
                    </h2>
                  </div>

                  {loyaltyData.history.length === 0 ? (
                    <EmptyState
                      icon={History}
                      title="No points history yet"
                      description="Your points transactions will appear here once you start earning or redeeming points."
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
                              {transaction.description || 
                                (transaction.transaction_type === "earned" ? "Points Earned" : 
                                 transaction.transaction_type === "redeemed" ? "Points Redeemed" : 
                                 "Points Transaction")}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(transaction.created_at).toLocaleDateString("en-US", {
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
                              transaction.transaction_type === "earned"
                                ? "text-green-700"
                                : transaction.transaction_type === "redeemed"
                                ? "text-red-700"
                                : "text-gray-700"
                            }`}
                          >
                            {transaction.transaction_type === "earned" ? "+" : "-"}
                            {Math.abs(transaction.points).toLocaleString()} pts
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </div>
            ) : (
              <EmptyState
                icon={Gift}
                title="Unable to load loyalty points"
                description="Please try refreshing the page."
                action={{
                  label: "Retry",
                  onClick: load,
                }}
              />
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}

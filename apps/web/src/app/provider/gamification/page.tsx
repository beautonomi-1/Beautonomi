"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Trophy, 
  Star, 
  Award, 
  TrendingUp, 
  RefreshCw,
  CheckCircle2,
  Clock,
  Gift,
  Zap
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { handleError } from "@/lib/provider-portal/error-handler";

interface GamificationData {
  points: {
    total: number;
    lifetime: number;
    current_tier: number;
    last_calculated: string | null;
  };
  current_badge: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon_url: string | null;
    tier: number;
    color: string;
    requirements: {
      points?: number;
      min_rating?: number;
      min_reviews?: number;
      min_bookings?: number;
    };
    benefits: {
      free_subscription?: boolean;
      featured?: boolean;
    };
    earned_at: string | null;
    expires_at: string | null;
  } | null;
  milestones: Array<{
    id: string;
    milestone_type: string;
    achieved_at: string;
    metadata: Record<string, any>;
  }>;
  transactions: Array<{
    id: string;
    points: number;
    source: string;
    source_id: string | null;
    description: string | null;
    created_at: string;
  }>;
  progress_to_next_badge: {
    badge: {
      id: string;
      name: string;
      tier: number;
      color: string;
      requirements: {
        points?: number;
      };
    };
    current_points: number;
    required_points: number;
    points_needed: number;
    progress_percentage: number;
  } | null;
  provider_stats: {
    total_bookings: number;
    review_count: number;
    rating_average: number;
    total_earnings: number;
  };
}

export default function ProviderGamificationPage() {
  const [data, setData] = useState<GamificationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const loadGamificationData = async (initializeIfNeeded = false) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetcher.get<{ data: GamificationData }>(
        "/api/provider/gamification"
      );
      
      // If no points data exists and we should initialize, try to initialize
      if (initializeIfNeeded && (!response.data.points || response.data.points.total === 0)) {
        try {
          // Try to recalculate which will initialize if needed
          await fetcher.post("/api/provider/gamification", {});
          // Reload data after initialization
          const updatedResponse = await fetcher.get<{ data: GamificationData }>(
            "/api/provider/gamification"
          );
          setData(updatedResponse.data);
        } catch (initErr) {
          // If initialization fails, still show the data we have
          console.warn("Failed to initialize points:", initErr);
          setData(response.data);
        }
      } else {
        setData(response.data);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load gamification data";
      setError(errorMessage);
      handleError(err, {
        action: "loadGamification",
        resource: "gamification data",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true);
      
      await fetcher.post("/api/provider/gamification", {});
      
      // Reload data after recalculation
      await loadGamificationData();
    } catch (err) {
      handleError(err, {
        action: "recalculateGamification",
        resource: "gamification data",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  useEffect(() => {
    // Try to initialize if no data exists
    loadGamificationData(true);
  }, []);

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Rewards"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Rewards" }
        ]}
      >
        <LoadingTimeout loadingMessage="Loading rewards data..." timeoutMs={10000} />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        title="Rewards"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Rewards" }
        ]}
      >
        <EmptyState
          title="Failed to load rewards data"
          description={error || "Unable to load your points and badges"}
          action={{
            label: "Retry",
            onClick: loadGamificationData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatSource = (source: string) => {
    const sourceMap: Record<string, string> = {
      booking_completed: "Completed Booking",
      review_received: "Review Received",
      milestone: "Milestone Achievement",
      admin_adjustment: "Admin Adjustment",
    };
    return sourceMap[source] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <SettingsDetailLayout
      title="Rewards"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Rewards" }
      ]}
    >
      <PageHeader
        title="Rewards & Achievements"
        subtitle="Track your points, badges, and milestones"
      />

      {/* Current Badge & Points Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Current Badge */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Current Badge
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.current_badge ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg"
                    style={{ backgroundColor: data.current_badge.color || "#6366f1" }}
                  >
                    {data.current_badge.icon_url ? (
                      <img 
                        src={data.current_badge.icon_url} 
                        alt={data.current_badge.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <Trophy className="w-10 h-10" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1">{data.current_badge.name}</h3>
                    {data.current_badge.description && (
                      <p className="text-sm text-gray-600 mb-2">{data.current_badge.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {data.current_badge.benefits.free_subscription && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Gift className="w-3 h-3 mr-1" />
                          Free Subscription
                        </Badge>
                      )}
                      {data.current_badge.benefits.featured && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          <Star className="w-3 h-3 mr-1" />
                          Featured
                        </Badge>
                      )}
                    </div>
                    {data.current_badge.earned_at && (
                      <p className="text-xs text-gray-500 mt-2">
                        Earned on {formatDate(data.current_badge.earned_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Award className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No badge yet. Keep earning points to unlock your first badge!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Points Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Points</p>
                <p className="text-3xl font-bold">{data.points.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Lifetime Points</p>
                <p className="text-2xl font-semibold text-gray-700">{data.points.lifetime.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Current Tier Points</p>
                <p className="text-xl font-semibold text-purple-600">{data.points.current_tier.toLocaleString()}</p>
              </div>
              <Button
                onClick={handleRecalculate}
                disabled={isRecalculating}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRecalculating ? "animate-spin" : ""}`} />
                {isRecalculating ? "Recalculating..." : "Recalculate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress to Next Badge */}
      {data.progress_to_next_badge && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Progress to Next Badge
            </CardTitle>
            <CardDescription>
              {data.progress_to_next_badge.badge.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Points Display with Star */}
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                  {data.progress_to_next_badge.current_points.toLocaleString()}
                  <Star className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF0077] fill-[#FF0077]" />
                </span>
                <span className="text-base sm:text-lg text-gray-600">
                  / {data.progress_to_next_badge.required_points.toLocaleString()} points
                </span>
                <span className="ml-auto text-xs sm:text-sm text-gray-600 font-semibold">
                  {data.progress_to_next_badge.progress_percentage}%
                </span>
              </div>
              
              {/* Progress Bar */}
              <div className="relative mt-4">
                <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#FF0077] to-[#D60565] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${data.progress_to_next_badge.progress_percentage}%` }}
                  />
                </div>
              </div>
              
              {/* Points Needed & Encouragement */}
              {data.progress_to_next_badge.points_needed > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm sm:text-base text-gray-700">
                    <span className="font-semibold text-[#FF0077]">{data.progress_to_next_badge.points_needed.toLocaleString()}</span> more points needed
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 italic">
                    💡 Keep earning points by completing bookings and receiving great reviews!
                  </p>
                </div>
              ) : (
                <p className="text-sm sm:text-base text-[#FF0077] font-semibold">
                  🎉 You've reached the requirements!
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Milestones and Transactions */}
      <Tabs defaultValue="milestones" className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="milestones">
            <Award className="w-4 h-4 mr-2" />
            Milestones ({data.milestones.length})
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Clock className="w-4 h-4 mr-2" />
            Point History ({data.transactions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="milestones">
          <Card>
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Milestones you've unlocked</CardDescription>
            </CardHeader>
            <CardContent>
              {data.milestones.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF0077] to-[#4fd1c5] flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold">
                            {milestone.milestone_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {formatDate(milestone.achieved_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Award className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No milestones unlocked yet. Keep working to earn achievements!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Point Transactions</CardTitle>
              <CardDescription>History of all point awards and deductions</CardDescription>
            </CardHeader>
            <CardContent>
              {data.transactions.length > 0 ? (
                <div className="space-y-3">
                  {data.transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          transaction.points > 0 
                            ? "bg-green-100 text-green-600" 
                            : "bg-red-100 text-red-600"
                        }`}>
                          {transaction.points > 0 ? (
                            <TrendingUp className="w-5 h-5" />
                          ) : (
                            <TrendingUp className="w-5 h-5 rotate-180" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{formatSource(transaction.source)}</p>
                          {transaction.description && (
                            <p className="text-sm text-gray-600">{transaction.description}</p>
                          )}
                          <p className="text-xs text-gray-500">{formatDate(transaction.created_at)}</p>
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${
                        transaction.points > 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {transaction.points > 0 ? "+" : ""}{transaction.points}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No transactions yet. Complete bookings and receive reviews to earn points!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Provider Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Your Stats</CardTitle>
          <CardDescription>Statistics that contribute to your points</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold">{data.provider_stats.total_bookings}</p>
              <p className="text-sm text-gray-600">Total Bookings</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold">{data.provider_stats.review_count}</p>
              <p className="text-sm text-gray-600">Reviews</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold">
                {data.provider_stats.rating_average > 0 
                  ? data.provider_stats.rating_average.toFixed(1) 
                  : "N/A"}
              </p>
              <p className="text-sm text-gray-600">Average Rating</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingsDetailLayout>
  );
}

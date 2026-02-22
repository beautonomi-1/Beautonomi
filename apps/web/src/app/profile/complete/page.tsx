"use client";

import { useState, useEffect } from "react";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import AuthGuard from "@/components/auth/auth-guard";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/ui/breadcrumb";

interface ChecklistItem {
  id: string;
  label: string;
  timeEstimate: string;
  completed: boolean;
  required: boolean;
}

interface CompletionData {
  completed: number;
  total: number;
  percentage: number;
  checklistItems: ChecklistItem[];
  topItems: ChecklistItem[];
}

const ITEM_ICONS: Record<string, any> = {
  photo: "📷",
  email: "✉️",
  preferred_name: "👤",
  bio: "📝",
  identity: "🆔",
  phone: "📱",
  address: "📍",
  emergency_contact: "🚨",
  profile_questions: "❓",
  interests: "❤️",
  beauty_preferences: "💄",
};

const ITEM_ROUTES: Record<string, string> = {
  photo: "#photo",
  email: "#email",
  preferred_name: "#preferred-name",
  bio: "/profile/create-profile",
  identity: "#identity",
  phone: "#phone",
  address: "#address",
  emergency_contact: "#emergency-contact",
  profile_questions: "/profile/create-profile",
  interests: "/profile/create-profile",
  beauty_preferences: "#beauty-preferences",
};

export default function CompleteProfilePage() {
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadCompletionData();
  }, []);

  const loadCompletionData = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: CompletionData }>("/api/me/profile-completion", {
        timeoutMs: 5000,
      });
      setCompletionData(response.data);
    } catch (error) {
      console.error("Error loading completion data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemClick = (item: ChecklistItem) => {
    const route = ITEM_ROUTES[item.id];
    if (route?.startsWith("#")) {
      // Scroll to section on profile page
      router.push(`/profile${route}`);
    } else if (route) {
      // Navigate to different page
      router.push(route);
    }
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            <LoadingTimeout loadingMessage="Loading checklist..." />
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (!completionData) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            <div className="text-center py-12">
              <p className="text-gray-600">Unable to load checklist. Please try refreshing the page.</p>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  const isComplete = completionData.percentage === 100;
  const _incompleteItems = completionData.checklistItems.filter((item) => !item.completed);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Profile", href: "/profile" },
              { label: "Complete Profile" },
            ]}
          />

          {/* Header */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Complete Profile</h1>
              {isComplete && (
                <Badge className="bg-green-100 text-green-700 border-green-300">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Complete
                </Badge>
              )}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
                <span className="font-medium">
                  {completionData.completed} of {completionData.total} completed
                </span>
                <span className="font-semibold text-[#FF0077]">{completionData.percentage}%</span>
              </div>
              <Progress value={completionData.percentage} className="h-3" />
            </div>
            {isComplete ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-green-900">Profile Complete! 🎉</h3>
                </div>
                <p className="text-sm text-green-800">
                  Great job! Your profile is complete. You can update it anytime from your profile page.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                Complete your profile to increase trust and get more bookings.
              </p>
            )}
          </div>

          {/* Top 3 Items */}
          {!isComplete && completionData.topItems.length > 0 && (
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Top 3 to Complete</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {completionData.topItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl">{ITEM_ICONS[item.id] || "📋"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.timeEstimate}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 flex-shrink-0"
                    >
                      {item.completed ? "Edit" : "Start"}
                    </Button>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* All Items */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">All Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completionData.checklistItems.map((item) => {
                const Icon = item.completed
                  ? CheckCircle2
                  : item.required
                  ? AlertCircle
                  : Circle;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Icon
                        className={`h-5 w-5 flex-shrink-0 ${
                          item.completed
                            ? "text-green-600"
                            : item.required
                            ? "text-orange-500"
                            : "text-gray-400"
                        }`}
                      />
                      <span className="text-xl">{ITEM_ICONS[item.id] || "📋"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{item.label}</p>
                          {item.required && !item.completed && (
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                              Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{item.timeEstimate}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={item.completed ? "ghost" : "outline"}
                      className="ml-2 flex-shrink-0"
                    >
                      {item.completed ? "Edit" : "Start"}
                    </Button>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Back Button */}
          <div className="flex justify-center">
            <Link href="/profile">
              <Button variant="outline">Back to Profile</Button>
            </Link>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

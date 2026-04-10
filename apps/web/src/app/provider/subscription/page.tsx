"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Calendar } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface SubscriptionPlan {
  id: string;
  plan_id: string;
  name: string;
  price: number;
  currency: string;
  billing_period: "monthly" | "yearly";
  features: string[];
  is_popular?: boolean;
  is_free?: boolean;
}

interface ProviderSubscription {
  id: string;
  plan_id: string;
  status: "active" | "expired" | "cancelled" | "past_due" | "trial";
  started_at?: string;
  expires_at?: string;
  billing_period?: "monthly" | "yearly";
  auto_renew?: boolean;
  plan?: any;
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<ProviderSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showInAppReturnBanner, setShowInAppReturnBanner] = useState(false);

  useEffect(() => {
    loadData();

    const urlParams = new URLSearchParams(window.location.search);
    const isPaymentSuccess = urlParams.get("payment_success") === "true";
    const inApp = urlParams.get("in_app") === "1";

    if (isPaymentSuccess) {
      toast.success("Payment successful! Your subscription is being activated...");
      if (inApp) setShowInAppReturnBanner(true);
      setTimeout(() => loadData(), 2000);
      const cleanSearch = inApp ? "?in_app=1" : "";
      window.history.replaceState({}, "", window.location.pathname + cleanSearch);

      // When loaded inside the provider app WebView: tell the app to close WebView and show native subscription (automatic return)
      if (inApp && typeof window !== "undefined") {
        const win = window as Window & { ReactNativeWebView?: { postMessage: (data: string) => void } };
        if (win.ReactNativeWebView?.postMessage) {
          const delay = 1500;
          const t = setTimeout(() => {
            win.ReactNativeWebView?.postMessage(JSON.stringify({ type: "subscription_success" }));
          }, delay);
          return () => clearTimeout(t);
        }
      }
    }
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [subscriptionRes, plansRes] = await Promise.all([
        fetcher.get<{ data: ProviderSubscription | null }>("/api/provider/subscription"),
        fetcher.get<{ data: SubscriptionPlan[] }>("/api/public/subscription-plans"),
      ]);

      const sub = (subscriptionRes as any)?.data ?? null;
      setSubscription(sub);
      const rawPlans = (plansRes as any)?.data ?? [];
      setPlans(Array.isArray(rawPlans) ? rawPlans : []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load subscription data";
      setError(errorMessage);
      console.error("Error loading subscription:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    try {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) throw new Error("Plan not found");

      // Try to upgrade directly (may work if authorization exists)
      const res = await fetcher.post<{ 
        data: { 
          payment_url?: string | null;
          requires_payment?: boolean;
          is_free?: boolean;
          subscription_id?: string;
        } 
      }>(
        "/api/provider/subscription/upgrade",
        { plan_id: plan.plan_id, billing_period: plan.billing_period }
      );

      const data = (res as any).data;

      // Free tier - subscription created directly
      if (data.is_free) {
        toast.success("Free subscription activated!");
        setShowUpgradeDialog(false);
        loadData();
        return;
      }

      // If subscription created successfully
      if (data.subscription_id && !data.requires_payment) {
        toast.success("Subscription activated successfully!");
        setShowUpgradeDialog(false);
        loadData();
        return;
      }

      // If payment authorization is required
      if (data.requires_payment || data.payment_url) {
        // Initialize payment to get authorization
        const paymentRes = await fetcher.post<{ 
          data: { 
            payment_url: string | null;
            order_id: string;
          } 
        }>(
          "/api/provider/subscription/initialize-payment",
          { plan_id: plan.plan_id, billing_period: plan.billing_period }
        );

        const paymentUrl = (paymentRes as any).data?.payment_url;
        if (paymentUrl) {
          window.location.href = paymentUrl;
          return;
        }
      }

      // Fallback to direct payment URL if available
      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      toast.success("Subscription checkout started");
      setShowUpgradeDialog(false);
    } catch (error) {
      toast.error("Failed to upgrade subscription");
      console.error("Error upgrading subscription:", error);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.")) {
      return;
    }

    try {
      await fetcher.post("/api/provider/subscription/cancel");
      toast.success("Subscription cancelled. You'll retain access until the end of your billing period.");
      await loadData();
    } catch (error) {
      const msg = error instanceof FetchError ? error.message : "Failed to cancel subscription";
      toast.error(msg);
      console.error("Error cancelling subscription:", error);
    }
  };

  const handleRenew = async () => {
    try {
      const res = await fetcher.post<{ data: { payment_url: string | null } }>(
        "/api/provider/subscription/renew"
      );
      const url = (res as any).data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("No payment link received. Please try again or contact support.");
    } catch (error) {
      toast.error("Failed to renew subscription");
      console.error("Error renewing subscription:", error);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout>
        <LoadingTimeout loadingMessage="Loading subscription..." />
      </SettingsDetailLayout>
    );
  }

  if (error && !subscription) {
    return (
      <SettingsDetailLayout>
        <EmptyState
          title="Failed to load subscription"
          description={error}
          action={{
            label: "Retry",
            onClick: loadData,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  // The joined plan from the subscription API uses price_monthly/price_yearly; normalise to SubscriptionPlan shape
  const rawPlan: any = subscription?.plan;
  const isFree = rawPlan?.is_free || (rawPlan?.price_monthly == null && rawPlan?.price_yearly == null);
  const currentPlanFromSubscription: SubscriptionPlan | null = rawPlan
    ? {
        id: rawPlan.id ?? "",
        plan_id: rawPlan.id ?? subscription?.plan_id ?? "",
        name: rawPlan.name ?? "",
        price: rawPlan.price ?? rawPlan.price_monthly ?? 0,
        currency: rawPlan.currency ?? "ZAR",
        billing_period: subscription?.billing_period ?? "monthly",
        features: Array.isArray(rawPlan.features) ? rawPlan.features : [],
        is_free: isFree,
      }
    : null;
  const currentPlan =
    currentPlanFromSubscription ||
    plans.find((p) => p.plan_id === subscription?.plan_id || p.id === subscription?.plan_id) ||
    null;
  const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;

  return (
    <SettingsDetailLayout>
      <PageHeader
        title="Subscription Management"
        subtitle="Manage your Beautonomi subscription plan"
      />

      {showInAppReturnBanner && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm text-green-800">
          <p className="font-medium">Payment complete.</p>
          <p className="mt-1">Tap the button below to return to the app.</p>
          <a
            href="provider://subscription/success"
            className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Return to app
          </a>
        </div>
      )}

      {subscription ? (
        <div className="space-y-6">
          {/* Current Subscription Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Current Subscription
                    {subscription.status === "active" && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Active
                      </Badge>
                    )}
                    {subscription.status === "expired" && (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                        Expired
                      </Badge>
                    )}
                    {subscription.status === "cancelled" && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        Cancelled
                      </Badge>
                    )}
                    {subscription.status === "trial" && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        Trial
                      </Badge>
                    )}
                    {subscription.status === "past_due" && (
                      <Badge variant="secondary" className="bg-red-100 text-red-800">
                        Past Due
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {currentPlan?.name || "No plan selected"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscription.status === "active" && expiresAt && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Expires on: {expiresAt.toLocaleDateString()}
                  </span>
                </div>
              )}

              {currentPlan && (
                <div>
                  <p className="text-2xl font-bold mb-2">
                    {currentPlan.is_free || currentPlan.price === 0 ? "Free" : `${currentPlan.currency} ${currentPlan.price}`}
                    {!currentPlan.is_free && currentPlan.price > 0 && (
                      <span className="text-base font-normal text-gray-600">
                        /{currentPlan.billing_period === "monthly" ? "month" : "year"}
                      </span>
                    )}
                  </p>
                  <div className="space-y-2">
                    <p className="font-medium">Features included:</p>
                    <ul className="space-y-1">
                      {(Array.isArray(currentPlan.features) ? currentPlan.features : []).map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-green-600" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                {subscription.status !== "active" && (
                  <Button onClick={() => setShowUpgradeDialog(true)}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Choose Plan
                  </Button>
                )}
                {subscription.status === "active" && (
                  <>
                    <Button onClick={handleRenew} variant="outline">
                      Renew
                    </Button>
                    <Button onClick={handleCancel} variant="outline" className="text-red-600">
                      Cancel Subscription
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Available Plans */}
          {plans.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4">Available Plans</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan) => (
                  <Card
                    key={plan.id}
                    className={
                      plan.is_popular
                        ? "border-2 border-[#FF0077] relative"
                        : subscription?.plan_id === plan.plan_id
                        ? "border-2 border-gray-300"
                        : ""
                    }
                  >
                    {plan.is_popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-[#FF0077] text-white">Most Popular</Badge>
                      </div>
                    )}
                    {subscription?.plan_id === plan.plan_id && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge variant="secondary">Current Plan</Badge>
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle>{plan.name}</CardTitle>
                      <CardDescription>
                        <span className="text-2xl font-bold">
                          {(plan as any).is_free || plan.price === 0 ? "Free" : `${plan.currency} ${plan.price}`}
                        </span>
                        {!((plan as any).is_free) && plan.price > 0 && (
                          <span className="text-sm text-gray-600">
                            /{plan.billing_period === "monthly" ? "month" : "year"}
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 mb-4">
                        {(Array.isArray(plan.features) ? plan.features : []).map((feature, index) => (
                          <li key={index} className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 text-green-600" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      {subscription?.plan_id !== plan.plan_id && (
                        <Button
                          className="w-full"
                          onClick={() => handleUpgrade(plan.id)}
                          variant={plan.is_popular ? "default" : "outline"}
                        >
                          {subscription?.status === "trial" ? "Upgrade from Trial" : "Switch Plan"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title="No subscription yet"
          description="Choose a subscription plan to activate billing"
          action={{
            label: "Choose Plan",
            onClick: () => setShowUpgradeDialog(true),
          }}
        />
      )}

      <UpgradeDialog
        open={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        plans={plans}
        onUpgrade={handleUpgrade}
      />
    </SettingsDetailLayout>
  );
}

function UpgradeDialog({
  open,
  onClose,
  plans,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  onUpgrade: (planId: string) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade Your Subscription</DialogTitle>
          <DialogDescription>
            Choose a plan to continue using Beautonomi after your free trial
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                selectedPlan === plan.id
                  ? "border-[#FF0077] bg-pink-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{plan.name}</h4>
                  <p className="text-sm text-gray-600">
                    {(plan as any).is_free || plan.price === 0
                      ? "Free"
                      : `${plan.currency} ${plan.price}/${plan.billing_period === "monthly" ? "month" : "year"}`}
                  </p>
                </div>
                <input
                  type="radio"
                  checked={selectedPlan === plan.id}
                  onChange={() => setSelectedPlan(plan.id)}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlan) {
                  onUpgrade(selectedPlan);
                }
              }}
              disabled={!selectedPlan}
            >
              Upgrade
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

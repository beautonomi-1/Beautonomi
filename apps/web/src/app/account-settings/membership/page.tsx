"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Crown, Star, Award, Gift } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/pricing/calculate-booking-price-complete";

interface Membership {
  id: string;
  membership_id: string;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  discount_percentage: number;
  status: string;
  started_at: string;
  expires_at: string;
  auto_renew: boolean;
  member_since: string;
}

interface Benefit {
  type: string;
  name: string;
  description: string;
}

interface MembershipData {
  has_membership: boolean;
  membership: Membership | null;
  benefits: Benefit[];
  savings: {
    this_month: number;
    lifetime: number;
  };
}

interface AvailableMembership {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  discount_percentage: number;
  features: string[];
}

export default function MembershipPage() {
  const [loading, setLoading] = useState(true);
  const [membershipData, setMembershipData] = useState<MembershipData | null>(null);
  const [availablePlans, setAvailablePlans] = useState<AvailableMembership[]>([]);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AvailableMembership | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchMembershipData();
    fetchAvailablePlans();
  }, []);

  const fetchMembershipData = async () => {
    try {
      const response = await fetch("/api/me/membership", { cache: "no-store" });
      const data = await response.json();
      setMembershipData(data);
    } catch (error) {
      console.error("Failed to fetch membership:", error);
      toast.error("Failed to load membership data");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailablePlans = async () => {
    try {
      const response = await fetch("/api/memberships", { cache: "no-store" });
      const data = await response.json();
      setAvailablePlans(data.data || []);
    } catch (error) {
      console.error("Failed to fetch plans:", error);
    }
  };

  const handleSubscribe = async (membershipId: string) => {
    setProcessing(true);
    try {
      const response = await fetch("/api/me/membership/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: membershipId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to subscribe");
      }

      toast.success("You've successfully subscribed to the membership");

      setShowUpgradeDialog(false);
      fetchMembershipData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    setProcessing(true);
    try {
      const response = await fetch("/api/me/membership/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellation_reason: "User requested" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to cancel");
      }

      toast.success("Membership Cancelled - Your membership will remain active until the end of the billing period");

      setShowCancelDialog(false);
      fetchMembershipData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setProcessing(false);
    }
  };

  const getMembershipIcon = (name: string) => {
    if (name.toLowerCase().includes("platinum")) return <Crown className="w-6 h-6 text-purple-500" />;
    if (name.toLowerCase().includes("gold")) return <Award className="w-6 h-6 text-yellow-500" />;
    if (name.toLowerCase().includes("silver")) return <Star className="w-6 h-6 text-gray-400" />;
    return <Gift className="w-6 h-6 text-blue-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Your Membership</h1>
        <p className="text-muted-foreground mt-2">
          Manage your membership plan and view your benefits
        </p>
      </div>

      {membershipData?.has_membership ? (
        <>
          {/* Current Membership Card */}
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getMembershipIcon(membershipData.membership!.name)}
                  <div>
                    <CardTitle className="text-2xl">
                      {membershipData.membership!.name} Member
                    </CardTitle>
                    <CardDescription>
                      Member since {new Date(membershipData.membership!.member_since).toLocaleDateString()}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={membershipData.membership!.auto_renew ? "default" : "secondary"}>
                  {membershipData.membership!.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-background/60 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Billing</p>
                  <p className="text-xl font-bold">
                    {formatCurrency(membershipData.membership!.price)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{membershipData.membership!.billing_cycle}
                    </span>
                  </p>
                </div>
                <div className="bg-background/60 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Discount</p>
                  <p className="text-xl font-bold text-green-600">
                    {membershipData.membership!.discount_percentage}% off
                  </p>
                </div>
                <div className="bg-background/60 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Renews</p>
                  <p className="text-xl font-bold">
                    {new Date(membershipData.membership!.expires_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Your Benefits</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {membershipData.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">{benefit.name}</p>
                        {benefit.description && (
                          <p className="text-sm text-muted-foreground">{benefit.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  Your Savings
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-300">This Month</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {formatCurrency(membershipData.savings.this_month)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-300">Lifetime</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {formatCurrency(membershipData.savings.lifetime)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setShowUpgradeDialog(true)} variant="default">
                  Upgrade Plan
                </Button>
                {membershipData.membership!.auto_renew && (
                  <Button onClick={() => setShowCancelDialog(true)} variant="outline">
                    Cancel Membership
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* No Membership - Show Plans */}
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Plan</CardTitle>
              <CardDescription>
                Join a membership plan to unlock exclusive benefits and discounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {availablePlans.map((plan) => (
                  <Card
                    key={plan.id}
                    className="border-2 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedPlan(plan);
                      setShowUpgradeDialog(true);
                    }}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        {getMembershipIcon(plan.name)}
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {plan.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-3xl font-bold">
                          {formatCurrency(plan.price)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          per {plan.billing_cycle}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-lg px-3 py-1">
                        {plan.discount_percentage}% discount
                      </Badge>
                      <Button className="w-full" size="sm">
                        Select Plan
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Available Upgrades */}
      {membershipData?.has_membership && availablePlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Upgrades</CardTitle>
            <CardDescription>
              Get even more benefits with a higher tier membership
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {availablePlans
                .filter((plan) => plan.price > membershipData.membership!.price)
                .map((plan) => (
                  <Card key={plan.id} className="border hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        {getMembershipIcon(plan.name)}
                        <CardTitle className="text-base">{plan.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-2xl font-bold">
                          {formatCurrency(plan.price)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          per {plan.billing_cycle}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        +{plan.discount_percentage - membershipData.membership!.discount_percentage}% more discount
                      </Badge>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedPlan(plan);
                          setShowUpgradeDialog(true);
                        }}
                      >
                        Upgrade
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Membership?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your membership? You&apos;ll continue to have access until the end of your billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Membership
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel Membership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {membershipData?.has_membership ? "Upgrade" : "Subscribe to"} {selectedPlan?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedPlan?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Price</p>
              <p className="text-2xl font-bold">
                {selectedPlan && formatCurrency(selectedPlan.price)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{selectedPlan?.billing_cycle}
                </span>
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Discount</p>
              <p className="text-2xl font-bold text-green-600">
                {selectedPlan?.discount_percentage}% off all services
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedPlan && handleSubscribe(selectedPlan.id)}
              disabled={processing}
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                membershipData?.has_membership ? "Upgrade Now" : "Subscribe Now"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

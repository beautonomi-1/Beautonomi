"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, CheckCircle2, Users, MapPin, Calendar, DollarSign } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface ProviderInfo {
  business_type: string;
  capabilities?: any;
}

export default function UpgradeToSalonPage() {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProviderInfo();
  }, []);

  const loadProviderInfo = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: ProviderInfo }>("/api/me/provider");
      if (response.data) {
        setProviderInfo(response.data);
      }
    } catch (error) {
      console.error("Error loading provider info:", error);
      // If endpoint doesn't exist, try alternative
      try {
        const altResponse = await fetcher.get<{ data: ProviderInfo }>("/api/provider/profile");
        if (altResponse.data) {
          setProviderInfo(altResponse.data);
        }
      } catch (altError) {
        console.error("Alternative endpoint also failed:", altError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      setIsUpgrading(true);
      const response = await fetcher.post<{
        data: { upgraded: boolean; message: string };
      }>("/api/provider/upgrade-to-salon");
      
      toast.success(response.data.message || "Successfully upgraded to salon!");
      setShowConfirmDialog(false);
      
      // Reload provider info
      await loadProviderInfo();
      
      // Show success message and redirect after delay
      setTimeout(() => {
        window.location.href = "/provider/settings";
      }, 2000);
    } catch (error: any) {
      console.error("Upgrade error:", error);
      toast.error(error.message || "Failed to upgrade to salon");
    } finally {
      setIsUpgrading(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout 
        title="Upgrade to Salon" 
        subtitle="Loading..."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Upgrade to Salon" }
        ]}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading provider information..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  // Check if already a salon
  if (providerInfo?.business_type === "salon") {
    return (
      <SettingsDetailLayout
        title="Upgrade to Salon"
        subtitle="Your account is already a salon"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Upgrade to Salon" }
        ]}
      >
        <SectionCard>
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Your provider account is already configured as a salon. You have
              access to all salon features including team management, multiple
              locations, and advanced scheduling.
            </AlertDescription>
          </Alert>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Upgrade to Salon"
      subtitle="Convert your freelancer account to a salon and unlock advanced features"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Upgrade to Salon" }
      ]}
    >
      <div className="space-y-6">
        <SectionCard>
          <Alert className="mb-6 border-[#FF0077]/20 bg-[#FF0077]/5">
            <Info className="w-4 h-4 text-[#FF0077]" />
            <AlertDescription className="text-sm text-gray-700">
              Upgrading to a salon will enable team management, multiple
              locations, and advanced scheduling features. This action cannot be
              undone, but you'll gain access to all salon capabilities.
            </AlertDescription>
          </Alert>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-4">
                What you'll get:
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Users className="w-5 h-5 text-[#FF0077] mt-0.5" />
                  <div>
                    <h4 className="font-medium">Team Management</h4>
                    <p className="text-sm text-gray-600">
                      Add and manage team members, assign services, and track
                      commissions
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <MapPin className="w-5 h-5 text-[#FF0077] mt-0.5" />
                  <div>
                    <h4 className="font-medium">Multiple Locations</h4>
                    <p className="text-sm text-gray-600">
                      Manage multiple salon locations or branches from one
                      account
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <Calendar className="w-5 h-5 text-[#FF0077] mt-0.5" />
                  <div>
                    <h4 className="font-medium">Advanced Scheduling</h4>
                    <p className="text-sm text-gray-600">
                      Staff scheduling, shift management, and multi-staff
                      calendar views
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 border rounded-lg">
                  <DollarSign className="w-5 h-5 text-[#FF0077] mt-0.5" />
                  <div>
                    <h4 className="font-medium">Commission Tracking</h4>
                    <p className="text-sm text-gray-600">
                      Track earnings per staff member and manage commission
                      rates
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-lg mb-4">What happens:</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
                    Your account will be upgraded to salon status
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
                    You'll be added as the owner in the team management system
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
                    All your existing bookings, reviews, and data will be
                    preserved
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
                    Your primary location will be marked automatically
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>
                    You can immediately start adding team members and locations
                  </span>
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] text-white"
                size="lg"
              >
                Upgrade to Salon
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Upgrade to Salon</DialogTitle>
            <DialogDescription>
              Are you sure you want to upgrade your account to a salon? This
              will:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Change your business type to salon</li>
                <li>Enable team management features</li>
                <li>Allow multiple locations</li>
                <li>Add you as the owner in the team system</li>
              </ul>
              <p className="mt-3 font-medium">
                This action cannot be undone, but all your existing data will be
                preserved.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isUpgrading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpgrade}
              disabled={isUpgrading}
              className="bg-[#FF0077] hover:bg-[#D60565] text-white"
            >
              {isUpgrading ? "Upgrading..." : "Confirm Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}

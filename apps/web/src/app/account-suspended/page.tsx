"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { AlertCircle, Mail, Phone, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function AccountSuspendedPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [suspensionDetails, setSuspensionDetails] = React.useState<{
    reason?: string;
    suspended_at?: string;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      // Redirect to login if not authenticated
      router.push("/?redirect=/account-suspended");
      return;
    }

    if (user) {
      loadSuspensionDetails();
    }
  }, [user, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps -- load when user/isLoading change

  const loadSuspensionDetails = async () => {
    try {
      setIsLoadingDetails(true);
      const response = await fetch("/api/me/account-status");
      if (response.ok) {
        const data = await response.json();
        if (data.data?.is_suspended) {
          setSuspensionDetails({
            reason: data.data.suspension_reason,
            suspended_at: data.data.suspended_at,
          });
        } else {
          // Not suspended, redirect to home
          router.push("/");
        }
      }
    } catch (error) {
      console.error("Error loading suspension details:", error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  if (isLoading || isLoadingDetails) {
    return <LoadingTimeout />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-3xl font-bold text-gray-900 mb-2">
            Account Suspended
          </CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Your account has been suspended and access is currently restricted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {suspensionDetails?.reason && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-900 mb-2">Reason for Suspension</h3>
              <p className="text-yellow-800">{suspensionDetails.reason}</p>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">What does this mean?</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Your provider account is temporarily suspended</li>
              <li>You cannot accept new bookings or manage existing ones</li>
              <li>Your profile is not visible to customers</li>
              <li>You can still view your account information</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">What can you do?</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Review our Terms of Service and Community Guidelines</li>
              <li>Contact our support team to discuss your account status</li>
              <li>Provide any additional information that may help resolve the issue</li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3">Need Help?</h3>
            <div className="space-y-2 text-blue-800">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <a 
                  href="mailto:support@beautonomi.com" 
                  className="hover:underline"
                >
                  support@beautonomi.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <a 
                  href="tel:+27123456789" 
                  className="hover:underline"
                >
                  +27 12 345 6789
                </a>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
            <Button
              onClick={() => router.push("/help/submit-ticket")}
              className="flex-1 bg-[#FF0077] hover:bg-[#D60565]"
            >
              Contact Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

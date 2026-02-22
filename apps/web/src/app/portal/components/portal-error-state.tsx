"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Mail, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";

interface PortalErrorStateProps {
  error: string | null;
  isNoToken: boolean;
  onGoHome: () => void;
  onLearnMore: () => void;
}

export function PortalErrorState({
  error,
  isNoToken,
  onGoHome,
  onLearnMore,
}: PortalErrorStateProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkResult, setLinkResult] = useState<{
    portalUrl?: string;
    bookingNumber?: string;
  } | null>(null);

  const displayMessage = isNoToken
    ? "No booking link was provided. Use the link from your confirmation email or SMS to view your booking."
    : (error || "Unable to load booking. The link may be invalid or expired.");

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    setLoading(true);
    setLinkResult(null);
    try {
      const response = await fetcher.post<{
        data: { success: boolean; portalUrl?: string; bookingNumber?: string; message?: string };
      }>("/api/portal/request-link", { email: email.trim() });
      setLinkResult({
        portalUrl: response.data?.portalUrl,
        bookingNumber: response.data?.bookingNumber,
      });
      if (response.data?.portalUrl) {
        toast.success("New link generated!");
      } else {
        toast.success(response.data?.message || "If you have upcoming bookings, check your email.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to request link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isNoToken ? "Missing Booking Link" : "Access Denied"}
        </h1>
        <p className="text-gray-600 mb-6">{displayMessage}</p>

        {!isNoToken && (
          <div className="mb-6 text-left bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Request a new link
            </h3>
            {linkResult?.portalUrl ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Your new booking link:</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = linkResult.portalUrl!;
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open Booking
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(linkResult.portalUrl!);
                      toast.success("Link copied!");
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRequestLink} className="space-y-2">
                <input
                  type="email"
                  placeholder="Enter the email on your booking"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  disabled={loading}
                />
                <Button type="submit" size="sm" disabled={loading}>
                  {loading ? "Sending..." : "Send new link"}
                </Button>
              </form>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isNoToken && (
            <Button variant="outline" onClick={onLearnMore}>
              Learn how to access your booking
            </Button>
          )}
          <Button onClick={onGoHome}>Go to Homepage</Button>
        </div>
      </div>
    </div>
  );
}

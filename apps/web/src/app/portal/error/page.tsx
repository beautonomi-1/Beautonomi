"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function PortalErrorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get('reason') || 'Invalid or expired access token';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-4">{reason}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => router.push('/portal')} variant="outline">
            Learn about the portal
          </Button>
          <Button onClick={() => router.push('/')}>Go to Homepage</Button>
        </div>
      </div>
    </div>
  );
}

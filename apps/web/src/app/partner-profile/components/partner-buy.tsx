"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
const PartnerBuy: React.FC<{ id?: string; slug?: string }> = ({ id: providerId, slug: _slug }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleBuyGiftCard = async () => {
    if (!providerId) {
      router.push("/gift-card");
      return;
    }

    try {
      setIsLoading(true);
      // Default amount for quick buy; user can also go to /gift-card for custom.
      const res = await fetcher.post<{ data: { payment_url: string }; error: null }>(`/api/public/gift-cards/purchase`, {
        amount: 500,
        provider_id: providerId,
      });
      const url = res?.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.success("Purchase started. Check your Payments & Gift Cards.");
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to start gift card purchase");
      router.push("/gift-card");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Gift Cards</h2>
      
      <div className="max-w-3xl">
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Treat yourself or a friend</h3>
            <p className="text-gray-600 text-sm mb-4">
              Purchase a gift card for future visits to this provider. Gift cards can be used for any service or booking.
            </p>
          </div>
          <button
            onClick={handleBuyGiftCard}
            disabled={isLoading}
            className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-60"
          >
            {isLoading ? "Redirecting..." : "Buy Gift Card"}
          </button>
        </div>

        {/* Info about custom service requests */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">
            <strong className="font-medium text-gray-900">Need a custom service?</strong>{" "}
            Use the <strong className="font-medium text-gray-900">"Request Custom Service"</strong> tab above 
            to submit a detailed request with your specific requirements, budget, preferred dates, and inspiration images.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PartnerBuy;

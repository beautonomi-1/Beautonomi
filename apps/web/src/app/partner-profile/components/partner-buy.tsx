"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";
const PartnerBuy: React.FC<{ id?: string; slug?: string }> = ({ id: providerId, slug: _slug }) => {
  const router = useRouter();
  const { pp } = usePartnerProfileT();
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
      toast.success(pp("purchaseStarted"));
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : pp("failedGiftCardPurchase"));
      router.push("/gift-card");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">{pp("giftCardsHeading")}</h2>
      
      <div className="max-w-3xl">
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">{pp("giftCardsTreat")}</h3>
            <p className="text-gray-600 text-sm mb-4">
              {pp("giftCardsBody")}
            </p>
          </div>
          <button
            onClick={handleBuyGiftCard}
            disabled={isLoading}
            className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium disabled:opacity-60"
          >
            {isLoading ? pp("redirecting") : pp("buyGiftCardCta")}
          </button>
        </div>

        {/* Info about custom service requests */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">
            <strong className="font-medium text-gray-900">{pp("giftCardsNeedCustom")}</strong>{" "}
            {pp("giftCardsNeedCustomBody", { tab: pp("tabCustomService") })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PartnerBuy;

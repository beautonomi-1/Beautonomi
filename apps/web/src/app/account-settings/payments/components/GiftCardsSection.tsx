"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Gift, Copy } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface GiftCard {
  id: string;
  code: string;
  currency: string;
  initial_balance: number;
  balance: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

function GiftCardsSection() {
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadGiftCards();
  }, []);

  const loadGiftCards = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ gift_cards: GiftCard[] }>(
        "/api/me/gift-cards",
        { cache: "no-store" }
      );
      setGiftCards(response.gift_cards || []);
    } catch (error) {
      console.error("Failed to load gift cards:", error);
      // Don't show error, just show empty state
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Gift card code copied to clipboard");
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "ZAR",
    }).format(amount);
  };

  const getStatusBadge = (card: GiftCard) => {
    if (!card.is_active) {
      return <Badge variant="outline" className="text-xs">Inactive</Badge>;
    }
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return <Badge className="bg-red-100 text-red-800 text-xs">Expired</Badge>;
    }
    if (card.balance === 0) {
      return <Badge className="bg-gray-100 text-gray-800 text-xs">Used</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>;
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
      >
        <LoadingTimeout loadingMessage="Loading gift cards..." />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
          Beautonomi gift credit
        </h2>
        <Link href="/gift-card">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
          >
            Buy gift card
          </motion.button>
        </Link>
      </div>

      {giftCards.length === 0 ? (
        <div className="text-center py-8">
          <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-base font-light mb-4 text-gray-600">
            You don&apos;t have any gift cards yet.
          </p>
          <Link href="/gift-card/purchase">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-lg hover:shadow-xl"
            >
              Purchase your first gift card
            </motion.button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {giftCards.map((card) => (
            <div
              key={card.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="font-mono font-semibold text-lg">{card.code}</div>
                  <button
                    onClick={() => handleCopyCode(card.code)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Copy code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {getStatusBadge(card)}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>
                    Balance:{" "}
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(card.balance, card.currency)}
                    </span>
                  </span>
                  {card.expires_at && (
                    <span>
                      Expires: {new Date(card.expires_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default GiftCardsSection;

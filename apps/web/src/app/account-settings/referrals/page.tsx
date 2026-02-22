"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "@/components/ui/back-button";
import BottomNav from "@/components/layout/bottom-nav";
import AuthGuard from "@/components/auth/auth-guard";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Copy, Share2, Gift, Users, TrendingUp, Loader2, Check } from "lucide-react";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";

interface ReferralStats {
  total_referrals: number;
  successful_referrals: number;
  total_earnings: number;
  pending_earnings: number;
}

interface ReferralSettings {
  referral_amount: number;
  referral_message: string;
  referral_currency: string;
  is_enabled: boolean;
}

const ReferralsPage = () => {
  const { user } = useAuth();
  const { format } = usePlatformCurrency();
  const [referralCode, setReferralCode] = useState<string>("");
  const [referralLink, setReferralLink] = useState<string>("");
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user) {
      loadReferralData();
    }
  }, [user]);

  const loadReferralData = async () => {
    try {
      setIsLoading(true);
      
      // Load referral data from API
      const [referralRes, settingsRes] = await Promise.all([
        fetcher.get<{ data: { referral_code: string; referral_link: string; stats: ReferralStats; settings: ReferralSettings } }>("/api/me/referrals", { cache: "no-store" }),
        fetcher.get<{ data: ReferralSettings }>("/api/public/referrals/settings").catch(() => null),
      ]);

      // Set referral code and link
      setReferralCode(referralRes.data.referral_code);
      setReferralLink(referralRes.data.referral_link);

      // Set stats
      setStats(referralRes.data.stats);

      // Set settings (prefer public endpoint, fallback to user endpoint)
      setSettings(settingsRes?.data || referralRes.data.settings);
    } catch (error) {
      console.error("Failed to load referral data:", error);
      toast.error("Failed to load referral information");
      
      // Fallback to defaults
      setReferralCode("BEAUTY");
      setReferralLink(typeof window !== "undefined" ? `${window.location.origin}/signup?ref=BEAUTY` : "");
      setStats({
        total_referrals: 0,
        successful_referrals: 0,
        total_earnings: 0,
        pending_earnings: 0,
      });
      setSettings({
        referral_amount: 50,
        referral_message: "Join Beautonomi and get rewarded! Use my referral link to get started.",
        referral_currency: "ZAR",
        is_enabled: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Beautonomi",
          text: settings?.referral_message || "Join Beautonomi and get rewarded!",
          url: referralLink,
        });
        toast.success("Shared successfully!");
      } catch (error) {
        // User cancelled or error
        if ((error as Error).name !== "AbortError") {
          toast.error("Failed to share");
        }
      }
    } else {
      // Fallback to copy
      handleCopy();
    }
  };

  const [faqData, setFaqData] = useState<Array<{
    id: string;
    question: string;
    answer: string | string[];
    isList: boolean;
  }>>([]);

  useEffect(() => {
    const loadFAQs = async () => {
      try {
        const response = await fetcher.get<{ data: Array<{
          id: string;
          question: string;
          answer: string | null;
          answer_type: "text" | "list";
          answer_list: string[] | null;
        }> }>("/api/public/referrals/faqs");
        
        if (response.data && response.data.length > 0) {
          const transformed = response.data.map((faq) => {
            // Handle dynamic answer for "How much can I earn" question
            let answer: string | string[] = faq.answer || "";
            if (faq.answer_type === "list" && faq.answer_list) {
              answer = faq.answer_list;
            } else if (faq.answer && faq.question.toLowerCase().includes("how much")) {
              // Replace placeholder with actual amount
              answer = answer.replace(
                /\$\{referral_amount\}/g,
                `${settings?.referral_amount || 50} ${settings?.referral_currency || "ZAR"}`
              );
            }
            
            return {
              id: faq.id,
              question: faq.question,
              answer,
              isList: faq.answer_type === "list",
            };
          });
          setFaqData(transformed);
        } else {
          // Fallback to default FAQs if none exist
          setFaqData([
            {
              id: "item-1",
              question: "How does the referral program work?",
              answer: [
                "Share your unique referral link with friends and family.",
                "When someone signs up using your link and completes their first booking, you both earn rewards.",
                "Your referral must complete a booking to qualify for rewards.",
                "Rewards are credited to your wallet after the referred user's first completed booking.",
              ],
              isList: true,
            },
            {
              id: "item-2",
              question: "How much can I earn from referrals?",
              answer: `You earn ${settings?.referral_amount || 50} ${settings?.referral_currency || "ZAR"} for each successful referral. The amount may vary based on current promotions. Check your referral dashboard for the latest reward amounts.`,
              isList: false,
            },
            {
              id: "item-3",
              question: "When do I receive my referral rewards?",
              answer: "You receive your referral reward after the person you referred completes their first booking on Beautonomi. The reward is credited to your wallet and can be used for future bookings or withdrawn according to our payout policy.",
              isList: false,
            },
            {
              id: "item-4",
              question: "Can I refer the same person multiple times?",
              answer: "No, each person can only be referred once. If someone has already signed up for Beautonomi, they cannot use your referral link to earn rewards.",
              isList: false,
            },
            {
              id: "item-5",
              question: "How do I track my referrals?",
              answer: "You can track all your referrals, earnings, and pending rewards on this page. The dashboard shows your total referrals, successful referrals, and total earnings.",
              isList: false,
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to load FAQs:", error);
        // Use fallback FAQs on error
      }
    };

    if (settings) {
      loadFAQs();
    }
  }, [settings]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <Breadcrumb 
            items={[
              { label: "Home", href: "/" },
              { label: "Account Settings", href: "/account-settings" },
              { label: "Referrals" }
            ]} 
          />
          <BackButton href="/account-settings" />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              Referrals
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-[#FF0077] animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Referral Code Card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                      <Gift className="w-6 h-6 text-[#FF0077]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                        Your referral code
                      </h2>
                      <p className="text-sm font-light text-gray-600 mt-1">
                        Share your code and earn rewards when friends book services
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500 mb-1">Referral Code</p>
                        <p className="text-2xl font-bold text-gray-900 font-mono">{referralCode}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500 mb-1">Referral Link</p>
                        <p className="text-sm font-mono text-gray-700 break-all">{referralLink}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <motion.button
                        onClick={handleCopy}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
                      >
                        {copied ? (
                          <>
                            <Check className="w-5 h-5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-5 h-5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </motion.button>
                      <motion.button
                        onClick={handleShare}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex-1 flex items-center justify-center gap-2 backdrop-blur-sm bg-white/60 border border-white/40 hover:bg-white/80 text-gray-700 px-6 py-3 rounded-xl font-semibold transition-all"
                      >
                        <Share2 className="w-5 h-5" />
                        <span>Share</span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>

                {/* Stats Cards */}
                {stats && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Users className="w-5 h-5 text-[#FF0077]" />
                        <p className="text-sm font-medium text-gray-600">Total Referrals</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">{stats.total_referrals}</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <p className="text-sm font-medium text-gray-600">Successful</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">{stats.successful_referrals}</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Gift className="w-5 h-5 text-[#FF0077]" />
                        <p className="text-sm font-medium text-gray-600">Total Earnings</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">
                        {format(stats.total_earnings)}
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-yellow-600" />
                        <p className="text-sm font-medium text-gray-600">Pending</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">
                        {format(stats.pending_earnings)}
                      </p>
                    </motion.div>
                  </div>
                )}

                {/* FAQ Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-2xl font-semibold tracking-tighter text-gray-900 mb-2">
                    Common questions
                  </h2>
                  <p className="text-sm font-light text-gray-600 mb-6">
                    Check out these answers to common questions and review other program information in the{" "}
                    <a href="/help" className="text-[#FF0077] hover:text-[#E6006A] underline font-medium">
                      Help Center
                    </a>
                    .
                  </p>

                  <Accordion type="single" collapsible className="w-full">
                    {faqData.map((faq) => (
                      <AccordionItem key={faq.id} value={faq.id} className="border-b border-white/20">
                        <AccordionTrigger className="text-left font-semibold text-gray-900 hover:text-[#FF0077] transition-colors py-4">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600 font-light leading-relaxed pt-2 pb-4">
                          {faq.isList ? (
                            <ol className="list-decimal ml-6 space-y-2">
                              {(Array.isArray(faq.answer) ? faq.answer : []).map((item, index) => (
                                <li key={index}>{item}</li>
                              ))}
                            </ol>
                          ) : (
                            <p>{typeof faq.answer === 'string' ? faq.answer : ''}</p>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>
        <BottomNav />
      </div>
    </AuthGuard>
  );
};

export default ReferralsPage;

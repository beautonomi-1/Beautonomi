"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import React, { useState, useEffect, useRef } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Breadcrumb from "../components/breadcrumb";
import BackButton from "@/components/ui/back-button";
import BottomNav from "@/components/layout/bottom-nav";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Copy, Share2, Gift, Users, TrendingUp, Check } from "lucide-react";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import type { ReferralSettings, ReferralStats, ReferralsPageInitial } from "./referrals-initial-types";
import { useTranslation } from "@beautonomi/i18n";

const ReferralsPage = ({ initial }: { initial: ReferralsPageInitial | null }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const { format } = usePlatformCurrency();
  const [referralCode, setReferralCode] = useState(() => initial?.referral_code ?? "");
  const [referralLink, setReferralLink] = useState(() => initial?.referral_link ?? "");
  const [stats, setStats] = useState<ReferralStats | null>(() => initial?.stats ?? null);
  const [settings, setSettings] = useState<ReferralSettings | null>(() => initial?.settings ?? null);
  const [isLoading, setIsLoading] = useState(() => !initial);
  const [copied, setCopied] = useState(false);
  const skipHydrateLoadOnce = useRef(!!initial);

  useEffect(() => {
    if (!user) return;
    if (skipHydrateLoadOnce.current && initial) {
      skipHydrateLoadOnce.current = false;
      return;
    }
    void loadReferralData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is fixed for this navigation
  }, [user]);

  const loadReferralData = async () => {
    try {
      setIsLoading(true);
      
      // Load referral data from API
      const [referralRes, settingsRes] = await Promise.all([
        fetcher.get<{ data: { referral_code: string; referral_link: string; stats: ReferralStats; settings: ReferralSettings } }>("/api/me/referrals", { staleTimeMs: 30_000 }),
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
      toast.error(t("web.accountSettings.referrals.loadFailed"));
      
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
        referral_message: t("web.accountSettings.referrals.defaultShareMessage"),
        referral_currency: tenantCurrency,
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
      toast.success(t("web.accountSettings.referrals.linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("web.accountSettings.referrals.copyFailed"));
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("web.accountSettings.referrals.shareTitle"),
          text: settings?.referral_message || t("web.accountSettings.referrals.shareText"),
          url: referralLink,
        });
        toast.success(t("web.accountSettings.referrals.shared"));
      } catch (error) {
        // User cancelled or error
        if ((error as Error).name !== "AbortError") {
          toast.error(t("web.accountSettings.referrals.shareFailed"));
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
                `${settings?.referral_amount || 50} ${settings?.referral_currency || tenantCurrency}`
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
              question: t("web.accountSettings.referrals.faqHowWorks"),
              answer: [
                t("web.accountSettings.referrals.faqHowWorks1"),
                t("web.accountSettings.referrals.faqHowWorks2"),
                t("web.accountSettings.referrals.faqHowWorks3"),
                t("web.accountSettings.referrals.faqHowWorks4"),
              ],
              isList: true,
            },
            {
              id: "item-2",
              question: t("web.accountSettings.referrals.faqHowMuch"),
              answer: t("web.accountSettings.referrals.faqHowMuchAnswer", {
                amount: settings?.referral_amount || 50,
                currency: settings?.referral_currency || tenantCurrency,
              }),
              isList: false,
            },
            {
              id: "item-3",
              question: t("web.accountSettings.referrals.faqWhenRewards"),
              answer: t("web.accountSettings.referrals.faqWhenRewardsAnswer"),
              isList: false,
            },
            {
              id: "item-4",
              question: t("web.accountSettings.referrals.faqSamePerson"),
              answer: t("web.accountSettings.referrals.faqSamePersonAnswer"),
              isList: false,
            },
            {
              id: "item-5",
              question: t("web.accountSettings.referrals.faqTrack"),
              answer: t("web.accountSettings.referrals.faqTrackAnswer"),
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
  }, [settings, t, tenantCurrency]);

  return (
    <div className="min-h-screen bg-zinc-50/50 pb-20 md:pb-0">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <Breadcrumb 
            items={[
              { label: t("web.accountSettings.referrals.breadcrumbHome"), href: "/" },
              { label: t("web.accountSettings.referrals.breadcrumbAccount"), href: "/account-settings" },
              { label: t("web.accountSettings.referrals.breadcrumbTitle") }
            ]} 
          />
          <BackButton href="/account-settings" />

          <div
            className="mt-6"
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900 mb-8">
              {t("web.accountSettings.referrals.title")}
            </h1>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-gray-500">{t("web.accountSettings.referrals.loading")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* When referrals disabled by admin, show message and hide copy/share */}
                {settings?.is_enabled === false && (
                  <div
                    className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 md:p-6"
                  >
                    <p className="text-sm font-medium text-amber-800">
                      {t("web.accountSettings.referrals.disabledBanner")}
                    </p>
                  </div>
                )}

                {/* Referral Code Card */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-gradient-to-br from-[#FF0077]/10 to-[#E6006A]/10 rounded-xl">
                      <Gift className="w-6 h-6 text-[#FF0077]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tighter text-gray-900">
                        {t("web.accountSettings.referrals.yourCode")}
                      </h2>
                      <p className="text-sm font-light text-gray-600 mt-1">
                        {t("web.accountSettings.referrals.yourCodeHint")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500 mb-1">{t("web.accountSettings.referrals.referralCode")}</p>
                        <p className="text-2xl font-bold text-gray-900 font-mono">{referralCode}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 backdrop-blur-sm bg-white/60 border border-white/40 rounded-xl p-4">
                        <p className="text-xs font-medium text-gray-500 mb-1">{t("web.accountSettings.referrals.referralLink")}</p>
                        <p className="text-sm font-mono text-gray-700 break-all">{referralLink}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button type="button"
                        onClick={handleCopy}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
                      >
                        {copied ? (
                          <>
                            <Check className="w-5 h-5" />
                            <span>{t("web.accountSettings.referrals.copied")}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-5 h-5" />
                            <span>{t("web.accountSettings.referrals.copyLink")}</span>
                          </>
                        )}
                      </button>
                      <button type="button"
                        onClick={handleShare}
                        className="flex-1 flex items-center justify-center gap-2 backdrop-blur-sm bg-white/60 border border-white/40 hover:bg-white/80 text-gray-700 px-6 py-3 rounded-xl font-semibold transition-all"
                      >
                        <Share2 className="w-5 h-5" />
                        <span>{t("web.accountSettings.referrals.share")}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                {stats && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Users className="w-5 h-5 text-[#FF0077]" />
                        <p className="text-sm font-medium text-gray-600">{t("web.accountSettings.referrals.totalReferrals")}</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">{stats.total_referrals}</p>
                    </div>

                    <div
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <p className="text-sm font-medium text-gray-600">{t("web.accountSettings.referrals.successful")}</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">{stats.successful_referrals}</p>
                    </div>

                    <div
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Gift className="w-5 h-5 text-[#FF0077]" />
                        <p className="text-sm font-medium text-gray-600">{t("web.accountSettings.referrals.totalEarnings")}</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">
                        {format(stats.total_earnings)}
                      </p>
                    </div>

                    <div
                      className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <TrendingUp className="w-5 h-5 text-yellow-600" />
                        <p className="text-sm font-medium text-gray-600">{t("web.accountSettings.referrals.pending")}</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">
                        {format(stats.pending_earnings)}
                      </p>
                    </div>
                  </div>
                )}

                {/* FAQ Section */}
                <div
                  className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8"
                >
                  <h2 className="text-2xl font-semibold tracking-tighter text-gray-900 mb-2">
                    {t("web.accountSettings.referrals.commonQuestions")}
                  </h2>
                  <p className="text-sm font-light text-gray-600 mb-6">
                    {t("web.accountSettings.referrals.faqIntroBefore")}{" "}
                    <a href="/help" className="text-[#FF0077] hover:text-[#E6006A] underline font-medium">
                      {t("web.accountSettings.referrals.helpCenter")}
                    </a>
                    .
                  </p>

                  <Accordion type="single" collapsible className="w-full">
                    {faqData.map((faq) => (
                      <AccordionItem key={faq.id} value={faq.id} className="border-b border-white/20">
                        <AccordionTrigger className="text-start font-semibold text-gray-900 hover:text-[#FF0077] transition-colors py-4">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600 font-light leading-relaxed pt-2 pb-4">
                          {faq.isList ? (
                            <ol className="list-decimal ms-6 space-y-2">
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
                </div>
              </div>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
  );
};

export default ReferralsPage;

"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Briefcase, ArrowRight, CreditCard, Globe } from "lucide-react";
import LoginModal from "@/components/global/login-modal";
import InlineSignupForm from "@/components/global/inline-signup-form";
import { fetcher } from "@/lib/http/fetcher";
import logo from "../../../public/images/logo.svg";

interface SignupPageContent {
  headline?: string;
  sub_heading?: string;
  provider_card_title?: string;
  provider_card_micro_copy?: string;
  provider_card_description?: string;
  provider_card_badge?: string;
  customer_card_title?: string;
  customer_card_description?: string;
  customer_card_sub_description?: string;
  testimonial_quote?: string;
  testimonial_attribution?: string;
  testimonial_pure_commerce?: string;
  testimonial_yoco_support?: string;
  background_image_url?: string;
  footer_text?: string;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<"customer" | "provider" | null>(null);
  const [content, setContent] = useState<SignupPageContent>({});
  const [_isLoadingContent, setIsLoadingContent] = useState(true);
  const [highlightedCard, setHighlightedCard] = useState<"customer" | "provider" | null>(null);

  // Determine which card to highlight and auto-select based on referrer or query parameter
  useEffect(() => {
    // Check query parameter first
    const type = searchParams.get("type");
    if (type === "provider" || type === "customer") {
      setHighlightedCard(type);
      // Auto-select persona if type is clear and not already selected
      if (selectedPersona !== type) {
        setSelectedPersona(type);
      }
      return;
    }

    // Check referrer as fallback
    if (typeof window !== "undefined") {
      const referrer = document.referrer;
      
      // Only check referrer if it exists and is from the same origin
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          const currentUrl = new URL(window.location.href);
          
          // Only use referrer if it's from the same origin
          if (referrerUrl.origin === currentUrl.origin) {
            const referrerPath = referrerUrl.pathname;

            // If coming from /become-a-partner, highlight provider card and auto-select
            if (referrerPath.includes("/become-a-partner")) {
              setHighlightedCard("provider");
              if (selectedPersona !== "provider") {
                setSelectedPersona("provider");
              }
              return;
            }
            // If coming from home page (main customer page), highlight customer card and auto-select
            else if (referrerPath === "/" || referrerPath === "") {
              setHighlightedCard("customer");
              if (selectedPersona !== "customer") {
                setSelectedPersona("customer");
              }
              return;
            }
          }
        } catch {
          // Invalid referrer URL, ignore
        }
      }
      
      // Default: no specific highlight (provider card is already styled as highlighted by default)
      setHighlightedCard(null);
    }
  }, [searchParams]);

  // Fetch content from CMS
  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetcher.get<{ data: SignupPageContent; error: null }>("/api/public/signup-content");
        setContent(response.data || {});
      } catch (error) {
        console.error("Error loading signup page content:", error);
        // Use defaults if API fails
        setContent({});
      } finally {
        setIsLoadingContent(false);
      }
    };
    loadContent();
  }, []);

  const handlePersonaSelect = (persona: "customer" | "provider") => {
    setSelectedPersona(persona);
    // Show signup form on the same page - no navigation or modal
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-[#FBFBFB]">
      {/* Mobile: Lifestyle Banner - First on mobile */}
      <div className="md:hidden w-full h-[35vh] relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('${content.background_image_url || "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=2000&auto=format&fit=crop"}')`,
            filter: "grayscale(0.3)",
          }}
        >
          {/* Bottom-to-top gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#FBFBFB] via-[#FBFBFB]/50 to-transparent" />
        </div>
      </div>

      {/* Left Column - Functional (1fr) */}
      <div className="w-full md:w-[38.2%] bg-[#FBFBFB] flex flex-col">
        {/* Logo */}
        <div className="p-6 md:p-8">
          <Link href="/" className="inline-block">
            <Image src={logo} alt="Beautonomi Logo" className="h-8 w-auto" />
          </Link>
        </div>

        {/* Centered Selection Area */}
        <div className="flex-1 flex items-center justify-center px-6 md:px-12 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            {/* Headline */}
            <h1 className="font-black text-[#191C1F] text-4xl md:text-5xl lg:text-6xl tracking-tighter leading-[0.9] mb-4">
              {content.headline || "Elevate every encounter."}
            </h1>
            
            {/* Sub-heading */}
            <p className="font-medium text-lg text-gray-500 tracking-tight mb-8">
              {content.sub_heading || "Choose how you want to join Beautonomi"}
            </p>

            {/* Selection Cards - Only show if no persona selected */}
            {!selectedPersona && (
              <div className="space-y-4">
                {/* Render cards in order based on highlighted card */}
                {highlightedCard === "customer" ? (
                  <>
                    {/* For Customers Card - Show first when highlighted */}
                    <motion.button
                      onClick={() => handlePersonaSelect("customer")}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full rounded-[28px] p-6 text-left shadow-sm hover:shadow-md transition-all duration-300 group ${
                        highlightedCard === "customer"
                          ? "border-2 border-[#FF0077]/20 bg-white"
                          : "border border-gray-200 bg-white hover:border-gray-300"
                      }`}
                      aria-label="Sign up as a customer"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Users className="w-6 h-6 text-gray-700" />
                            <h3 className="font-black text-xl text-[#191C1F] tracking-tight">
                              {content.customer_card_title || "For Customers"}
                            </h3>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {content.customer_card_description || "Book beauty services with ease"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {content.customer_card_sub_description || "Discover and book beauty professionals"}
                          </p>
                        </div>
                        <motion.div
                          initial={{ x: 0 }}
                          whileHover={{ x: 5 }}
                          transition={{ duration: 0.2 }}
                          className="flex-shrink-0"
                        >
                          <ArrowRight className="w-6 h-6 text-gray-400 group-hover:text-[#FF0077] transition-colors" />
                        </motion.div>
                      </div>
                    </motion.button>

                    {/* For Beauty Providers Card - not highlighted when customer is first */}
                    <motion.button
                      onClick={() => handlePersonaSelect("provider")}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full relative rounded-[28px] p-6 text-left shadow-sm hover:shadow-md transition-all duration-300 group border border-gray-200 bg-white hover:border-gray-300"
                      aria-label="Sign up as a beauty provider"
                    >
                      {/* Most Popular Badge */}
                      {content.provider_card_badge && (
                        <div className="absolute -top-3 right-6 bg-[#FF0077] text-white px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">
                          {content.provider_card_badge}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Briefcase className="w-6 h-6 text-[#FF0077]" />
                            <h3 className="font-black text-xl text-[#191C1F] tracking-tight">
                              {content.provider_card_title || "For Beauty Providers"}
                            </h3>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {content.provider_card_micro_copy || "Powering beauty freelancer revolution"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {content.provider_card_description || "Salons, freelancers, and beauty professionals"}
                          </p>
                        </div>
                        <motion.div
                          initial={{ x: 0 }}
                          whileHover={{ x: 5 }}
                          transition={{ duration: 0.2 }}
                          className="flex-shrink-0"
                        >
                          <ArrowRight className="w-6 h-6 text-[#FF0077] group-hover:text-[#D60565] transition-colors" />
                        </motion.div>
                      </div>
                    </motion.button>
                  </>
                ) : (
                  <>
                    {/* For Beauty Providers Card - highlighted when provider or null (default order) */}
                    <motion.button
                      onClick={() => handlePersonaSelect("provider")}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full relative rounded-[28px] p-6 text-left shadow-sm hover:shadow-md transition-all duration-300 group border-2 border-[#FF0077]/20 bg-white"
                      aria-label="Sign up as a beauty provider"
                    >
                      {/* Most Popular Badge */}
                      {content.provider_card_badge && (
                        <div className="absolute -top-3 right-6 bg-[#FF0077] text-white px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">
                          {content.provider_card_badge}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Briefcase className="w-6 h-6 text-[#FF0077]" />
                            <h3 className="font-black text-xl text-[#191C1F] tracking-tight">
                              {content.provider_card_title || "For Beauty Providers"}
                            </h3>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {content.provider_card_micro_copy || "Powering beauty freelancer revolution"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {content.provider_card_description || "Salons, freelancers, and beauty professionals"}
                          </p>
                        </div>
                        <motion.div
                          initial={{ x: 0 }}
                          whileHover={{ x: 5 }}
                          transition={{ duration: 0.2 }}
                          className="flex-shrink-0"
                        >
                          <ArrowRight className="w-6 h-6 text-[#FF0077] group-hover:text-[#D60565] transition-colors" />
                        </motion.div>
                      </div>
                    </motion.button>

                    {/* For Customers Card - not highlighted when provider is first */}
                    <motion.button
                      onClick={() => handlePersonaSelect("customer")}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full rounded-[28px] p-6 text-left shadow-sm hover:shadow-md transition-all duration-300 group border border-gray-200 bg-white hover:border-gray-300"
                      aria-label="Sign up as a customer"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Users className="w-6 h-6 text-gray-700" />
                            <h3 className="font-black text-xl text-[#191C1F] tracking-tight">
                              {content.customer_card_title || "For Customers"}
                            </h3>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {content.customer_card_description || "Book beauty services with ease"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {content.customer_card_sub_description || "Discover and book beauty professionals"}
                          </p>
                        </div>
                        <motion.div
                          initial={{ x: 0 }}
                          whileHover={{ x: 5 }}
                          transition={{ duration: 0.2 }}
                          className="flex-shrink-0"
                        >
                          <ArrowRight className="w-6 h-6 text-gray-400 group-hover:text-[#FF0077] transition-colors" />
                        </motion.div>
                      </div>
                    </motion.button>
                  </>
                )}
              </div>
            )}

            {/* Signup Form - Show when persona is selected */}
            {selectedPersona && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full"
              >
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setSelectedPersona(null)}
                      className="text-sm text-gray-600 hover:text-[#FF0077] transition-colors underline"
                    >
                      ← Back to selection
                    </button>
                    {/* Switch persona link - only show if type was auto-selected */}
                    {searchParams.get("type") && (
                      <button
                        onClick={() => {
                          const otherPersona = selectedPersona === "provider" ? "customer" : "provider";
                          setSelectedPersona(otherPersona);
                          // Update URL to reflect switch
                          router.push(`/signup?type=${otherPersona}`);
                        }}
                        className="text-sm text-gray-600 hover:text-[#FF0077] transition-colors underline"
                      >
                        Switch to {selectedPersona === "provider" ? "Customer" : "Provider"} →
                      </button>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-[#191C1F] mb-2">
                    {selectedPersona === "provider" ? "Sign up as a Beauty Provider" : "Sign up as a Customer"}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Create your account to get started
                  </p>
                </div>
                {/* Inline signup form — pass ref= for referral attribution */}
                <InlineSignupForm
                  redirectContext={selectedPersona === "provider" ? "provider" : "customer"}
                  referralCode={searchParams.get("ref") ?? undefined}
                  onAuthSuccess={() => {
                    setSelectedPersona(null);
                  }}
                />
              </motion.div>
            )}

            {/* Already have an account - Only show if no persona selected */}
            {!selectedPersona && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="text-sm text-gray-600 hover:text-[#FF0077] transition-colors underline"
                  aria-label="Sign in to existing account"
                >
                  Already have an account? Sign in
                </button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            {content.footer_text ? (
              <span dangerouslySetInnerHTML={{ 
                __html: content.footer_text
                  .replace(/Terms of Service/g, '<a href="/terms-and-condition" class="underline hover:text-[#FF0077]">Terms of Service</a>')
                  .replace(/Privacy Policy/g, '<a href="/privacy" class="underline hover:text-[#FF0077]">Privacy Policy</a>')
              }} />
            ) : (
              <>
                By continuing, you agree to Beautonomi's{" "}
                <Link href="/terms-and-condition" className="underline hover:text-[#FF0077]">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-[#FF0077]">
                  Privacy Policy
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Right Column - Lifestyle (1.618fr) */}
      <div className="hidden md:block w-[61.8%] relative overflow-hidden">
        {/* Background Image with Grayscale Filter */}
        {/* Note: Replace with your professional beauty industry image featuring a person looking toward the center */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('${content.background_image_url || "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=2000&auto=format&fit=crop"}')`,
            filter: "grayscale(0.3)",
          }}
        >
          {/* Gradient Overlay (White to Transparent) */}
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/50 to-transparent" />
        </div>

        {/* Glassmorphism Testimonial Card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="absolute bottom-12 right-12 max-w-md backdrop-blur-2xl bg-white/10 border border-white/30 rounded-2xl p-6 shadow-2xl"
          style={{
            background: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div className="space-y-4">
            {content.testimonial_pure_commerce && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold text-sm">{content.testimonial_pure_commerce}</span>
                </div>
              </div>
            )}
            {content.testimonial_yoco_support && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold text-sm">{content.testimonial_yoco_support}</span>
                </div>
              </div>
            )}
            {(content.testimonial_quote || content.testimonial_attribution) && (
              <div className="pt-4 border-t border-white/30">
                {content.testimonial_quote && (
                  <p className="text-white text-sm leading-relaxed font-medium">
                    "{content.testimonial_quote}"
                  </p>
                )}
                {content.testimonial_attribution && (
                  <p className="text-white/80 text-xs mt-3 font-medium">
                    — {content.testimonial_attribution}
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>


      {/* Login Modal */}
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="signup"
        redirectContext="customer"
      />
    </div>
  );
}

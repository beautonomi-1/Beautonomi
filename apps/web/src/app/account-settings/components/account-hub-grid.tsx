"use client";

import Link from "next/link";
import React, { useState } from "react";
import {
  FaUser,
  FaShieldAlt,
  FaCreditCard,
  FaFileAlt,
  FaBell,
  FaEye,
  FaGlobe,
  FaSuitcase,
  FaGift,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaHeart,
  FaComments,
  FaStar,
  FaInfoCircle,
  FaShareAlt,
  FaWallet,
  FaStore,
  FaTrophy,
  FaShoppingBag,
  FaUndoAlt,
} from "react-icons/fa";
import AboutUsModal from "@/components/global/about-us-modal";
import ShareAppModal from "@/components/global/share-app-modal";
import { useAuth } from "@/providers/AuthProvider";

export interface AccountHubCard {
  icon: React.ElementType;
  title: string;
  description: string;
  link: string;
  isAction?: boolean;
}

export const ACCOUNT_HUB_CARDS: AccountHubCard[] = [
  { icon: FaUser, title: "Personal info", description: "Provide personal details and how we can reach you", link: "/account-settings/personal-info" },
  { icon: FaShieldAlt, title: "Login & security", description: "Update your password and secure your account", link: "/account-settings/login-and-security" },
  { icon: FaCreditCard, title: "Payments & payouts", description: "Review payments, payouts, coupons, and gift cards", link: "/account-settings/payments" },
  { icon: FaWallet, title: "Wallet", description: "Top up your wallet and view wallet activity", link: "/account-settings/wallet" },
  { icon: FaTrophy, title: "Loyalty Points", description: "Earn points on every booking, unlock rewards and milestones, redeem for discounts", link: "/account-settings/loyalty" },
  { icon: FaFileAlt, title: "Taxes", description: "Manage taxpayer information and tax documents", link: "/account-settings/taxes" },
  { icon: FaMapMarkerAlt, title: "Saved addresses", description: "Manage your saved addresses for faster checkout", link: "/account-settings/addresses" },
  { icon: FaCalendarAlt, title: "Bookings", description: "View and manage your upcoming, past, and cancelled bookings", link: "/account-settings/bookings" },
  { icon: FaShoppingBag, title: "Product Orders", description: "Track your product purchases and delivery status", link: "/account-settings/orders" },
  { icon: FaUndoAlt, title: "Returns & Refunds", description: "Request returns and track refund status", link: "/account-settings/returns" },
  { icon: FaCalendarAlt, title: "Recurring Bookings", description: "Manage your recurring appointments and subscriptions", link: "/account-settings/recurring-bookings" },
  { icon: FaCalendarAlt, title: "Waitlist", description: "View your waitlist entries and get notified when slots open", link: "/account-settings/waitlist" },
  { icon: FaBell, title: "Notifications", description: "Choose notification preferences and how you want to be contacted", link: "/account-settings/notifications" },
  { icon: FaGlobe, title: "Global preferences", description: "Set your default language, currency, and timezone", link: "/account-settings/preferences" },
  { icon: FaEye, title: "Privacy & sharing", description: "Manage your personal data, connected services, and data sharing settings", link: "/account-settings/privacy-and-sharing" },
  { icon: FaGift, title: "Referral credit & coupon", description: "You have $0 referral credits and coupon. Learn more.", link: "/account-settings/referrals" },
  { icon: FaStar, title: "My Reviews", description: "View and edit your reviews for completed bookings", link: "/account-settings/reviews" },
  { icon: FaHeart, title: "Wishlists & Recently Viewed", description: "Manage your saved wishlists and view recently viewed items", link: "/account-settings/wishlists" },
  { icon: FaComments, title: "Messages", description: "View and manage your messages with beauty partners and clients", link: "/account-settings/messages" },
  { icon: FaSuitcase, title: "Custom Requests", description: "Request custom services and manage offers from providers", link: "/account-settings/custom-requests" },
  { icon: FaInfoCircle, title: "About Us", description: "Learn more about Beautonomi and our mission", link: "#about-us", isAction: true },
  { icon: FaShareAlt, title: "Share App", description: "Share Beautonomi with your friends and family", link: "#share-app", isAction: true },
];

type AccountHubGridProps = {
  /** When true, render for the profile page (no standalone “Account” page chrome). */
  embeddedInProfile?: boolean;
};

export default function AccountHubGrid({ embeddedInProfile = false }: AccountHubGridProps) {
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const { user } = useAuth();

  const handleCardClick = (card: AccountHubCard, e: React.MouseEvent) => {
    if (card.isAction) {
      e.preventDefault();
      if (card.link === "#about-us") setShowAboutUs(true);
      else if (card.link === "#share-app") setShowShareApp(true);
    }
  };

  return (
    <>
      <div
        id={embeddedInProfile ? "account-management" : undefined}
        className={embeddedInProfile ? "rounded-xl border border-zinc-200 bg-white p-4 md:p-6 scroll-mt-24" : ""}
      >
        {embeddedInProfile ? (
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">Account & settings</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Bookings, wallet, notifications, and security — same hub as Account in the menu.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {ACCOUNT_HUB_CARDS.map((card, index) => (
            <div key={index} onClick={(e) => handleCardClick(card, e)}>
              {card.isAction ? (
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-all duration-200 active:scale-[0.98] h-full cursor-pointer">
                  <card.icon className="text-2xl md:text-3xl mb-3 md:mb-4 text-primary" />
                  <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{card.title}</h2>
                  <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{card.description}</p>
                </div>
              ) : (
                <Link href={card.link} prefetch={embeddedInProfile ? false : undefined} className="block">
                  <div
                    className={`p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border transition-all duration-200 active:scale-[0.98] h-full ${
                      card.link === "/account-settings/loyalty"
                        ? "bg-gradient-to-br from-white to-primary/5 border-primary/30 hover:border-primary/50"
                        : "bg-white border-gray-100 hover:border-[#FF0077]/20"
                    }`}
                  >
                    <card.icon className="text-2xl md:text-3xl mb-3 md:mb-4 text-primary" />
                    <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{card.title}</h2>
                    <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{card.description}</p>
                  </div>
                </Link>
              )}
            </div>
          ))}
          {user && user.role === "customer" && (
            <Link href="/provider/onboarding" prefetch={embeddedInProfile ? false : undefined} className="block">
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-all duration-200 active:scale-[0.98] h-full">
                <FaStore className="text-2xl md:text-3xl mb-3 md:mb-4 text-primary" />
                <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">Become a Provider</h2>
                <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">
                  Start offering your beauty services on Beautonomi. Manage bookings, payments, and grow your business all in one place.
                </p>
              </div>
            </Link>
          )}
        </div>

      </div>

      <AboutUsModal isOpen={showAboutUs} onClose={() => setShowAboutUs(false)} />
      <ShareAppModal isOpen={showShareApp} onClose={() => setShowShareApp(false)} />
    </>
  );
}

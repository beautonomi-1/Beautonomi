"use client"
import Link from 'next/link';
import React, { useState } from 'react';
import { 
  FaUser, FaShieldAlt, FaCreditCard, FaFileAlt, 
  FaBell, FaEye, FaGlobe, FaSuitcase, 
  FaGift, FaMapMarkerAlt, FaCalendarAlt, FaHeart, 
  FaComments, FaStar, FaInfoCircle, FaShareAlt, FaWallet, FaBuilding, FaStore, FaTrophy,
  FaShoppingBag, FaUndoAlt
} from 'react-icons/fa';
import AboutUsModal from '@/components/global/about-us-modal';
import ShareAppModal from '@/components/global/share-app-modal';
import EmailVerificationBanner from '@/components/global/email-verification-banner';
import { UpcomingBookingPreview } from './upcoming-booking-preview';
import { useAuth } from '@/providers/AuthProvider';

interface CardData {
  icon: React.ElementType;
  title: string;
  description: string;
  link: string;
  isAction?: boolean;
}

const cardData: CardData[] = [
  { icon: FaUser, title: "Personal info", description: "Provide personal details and how we can reach you", link: "/account-settings/personal-info" },
  { icon: FaShieldAlt, title: "Login & security", description: "Update your password and secure your account", link: "/account-settings/login-and-security" },
  { icon: FaCreditCard, title: "Payments & payouts", description: "Review payments, payouts, coupons, and gift cards", link: "/account-settings/payments" },
  { icon: FaWallet, title: "Wallet", description: "Top up your wallet and view wallet activity", link: "/account-settings/wallet" },
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
  { icon: FaTrophy, title: "Loyalty Points", description: "View your points balance, milestones, and redemption history", link: "/account-settings/loyalty" },
  { icon: FaStar, title: "My Reviews", description: "View and edit your reviews for completed bookings", link: "/account-settings/reviews" },
  { icon: FaHeart, title: "Wishlists & Recently Viewed", description: "Manage your saved wishlists and view recently viewed items", link: "/account-settings/wishlists" },
  { icon: FaBuilding, title: "Business Services", description: "Corporate packages, event bookings, and professional development", link: "/account-settings/business" },
  { icon: FaComments, title: "Messages", description: "View and manage your messages with beauty partners and clients", link: "/account-settings/messages" },
  { icon: FaSuitcase, title: "Custom Requests", description: "Request custom services and manage offers from providers", link: "/account-settings/custom-requests" },
  { icon: FaInfoCircle, title: "About Us", description: "Learn more about Beautonomi and our mission", link: "#about-us", isAction: true },
  { icon: FaShareAlt, title: "Share App", description: "Share Beautonomi with your friends and family", link: "#share-app", isAction: true },
];

const AccountSettingsPage: React.FC = () => {
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  
  // Use user from AuthProvider instead of making a separate API call
  // This is faster and avoids duplicate requests
  const { user, isLoading: isLoadingAuth } = useAuth();

  const handleCardClick = (card: CardData, e: React.MouseEvent) => {
    if (card.isAction) {
      e.preventDefault();
      if (card.link === '#about-us') {
        setShowAboutUs(true);
      } else if (card.link === '#share-app') {
        setShowShareApp(true);
      }
    }
  };

  return (
    <>
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <h1 className="text-2xl md:text-3xl font-normal mb-3 md:mb-4 text-gray-900">Account</h1>
        <EmailVerificationBanner />
        {user && (
          <div className="mb-4 md:mb-6">
            <UpcomingBookingPreview />
          </div>
        )}
        <div className="mb-4 md:mb-6">
          {isLoadingAuth ? (
            <span className="text-sm md:text-base text-gray-600 font-light">Loading...</span>
          ) : (
            <span className="text-sm md:text-base text-gray-600 font-light">
              {user?.full_name || "User"}, {user?.email || ""} ·{" "}
            </span>
          )}
          <a href="/profile" className="text-sm md:text-base text-[#FF0077] hover:text-[#D60565] underline font-medium transition-colors">Go to profile</a>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {cardData.map((card, index) => (
            <div key={index} onClick={(e) => handleCardClick(card, e)}>
              {card.isAction ? (
                <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-all duration-200 active:scale-[0.98] h-full cursor-pointer">
                  <card.icon className="text-2xl md:text-3xl mb-3 md:mb-4 text-[#FF0077]" />
                  <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{card.title}</h2>
                  <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{card.description}</p>
                </div>
              ) : (
                <Link href={card.link} className="block">
                  <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-all duration-200 active:scale-[0.98] h-full">
                    <card.icon className="text-2xl md:text-3xl mb-3 md:mb-4 text-[#FF0077]" />
                    <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{card.title}</h2>
                    <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{card.description}</p>
                  </div>
                </Link>
              )}
            </div>
          ))}
          {/* Add Become a Provider card for customers - placed last as it's unlikely for customers to become providers */}
          {user && user.role === 'customer' && (
            <Link href="/provider/onboarding" className="block">
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-all duration-200 active:scale-[0.98] h-full">
                <FaStore className="text-2xl md:text-3xl mb-3 md:mb-4 text-[#FF0077]" />
                <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">Become a Provider</h2>
                <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">
                  Start offering your beauty services on Beautonomi. Manage bookings, payments, and grow your business all in one place.
                </p>
              </div>
            </Link>
          )}
        </div>

        <div className="mt-6 md:mt-8 text-center">
          <p className="mb-2 text-sm md:text-base font-light text-gray-600">Need to deactivate your account?</p>
          <Link href="/account-settings/login-and-security" className="text-sm md:text-base text-[#FF0077] hover:text-[#D60565] underline font-medium transition-colors">Take care of that now</Link>
        </div>
      </div>

      <AboutUsModal isOpen={showAboutUs} onClose={() => setShowAboutUs(false)} />
      <ShareAppModal isOpen={showShareApp} onClose={() => setShowShareApp(false)} />
    </>
  );
};

export default AccountSettingsPage;
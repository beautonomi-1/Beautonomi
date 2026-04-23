"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState, lazy, Suspense, useCallback, useRef, memo, useEffect } from "react";
import {
  User,
  ShieldCheck,
  CreditCard,
  FileText,
  Bell,
  Eye,
  Globe,
  Briefcase,
  Gift,
  MapPin,
  CalendarDays,
  Heart,
  MessageCircle,
  Star,
  Info,
  Share2,
  Wallet,
  Store,
  Trophy,
  ShoppingBag,
  Undo2,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";

const AboutUsModal = lazy(() => import("@/components/global/about-us-modal"));
const ShareAppModal = lazy(() => import("@/components/global/share-app-modal"));

export interface AccountHubCard {
  icon: React.ElementType;
  title: string;
  description: string;
  link: string;
  isAction?: boolean;
}

export const ACCOUNT_HUB_CARDS: AccountHubCard[] = [
  { icon: User, title: "Personal info", description: "Provide personal details and how we can reach you", link: "/account-settings/personal-info" },
  { icon: ShieldCheck, title: "Login & security", description: "Update your password and secure your account", link: "/account-settings/login-and-security" },
  { icon: CreditCard, title: "Payments & payouts", description: "Review payments, payouts, coupons, and gift cards", link: "/account-settings/payments" },
  { icon: Wallet, title: "Wallet", description: "Top up your wallet and view wallet activity", link: "/account-settings/wallet" },
  { icon: Trophy, title: "Loyalty Points", description: "Earn points on every booking, unlock rewards and milestones, redeem for discounts", link: "/account-settings/loyalty" },
  { icon: FileText, title: "Taxes", description: "Manage taxpayer information and tax documents", link: "/account-settings/taxes" },
  { icon: MapPin, title: "Saved addresses", description: "Manage your saved addresses for faster checkout", link: "/account-settings/addresses" },
  { icon: CalendarDays, title: "Bookings", description: "View and manage your upcoming, past, and cancelled bookings", link: "/account-settings/bookings" },
  { icon: ShoppingBag, title: "Product Orders", description: "Track your product purchases and delivery status", link: "/account-settings/orders" },
  { icon: Undo2, title: "Returns & Refunds", description: "Request returns and track refund status", link: "/account-settings/returns" },
  { icon: CalendarDays, title: "Recurring Bookings", description: "Manage your recurring appointments and subscriptions", link: "/account-settings/recurring-bookings" },
  { icon: CalendarDays, title: "Waitlist", description: "View your waitlist entries and get notified when slots open", link: "/account-settings/waitlist" },
  { icon: Bell, title: "Notifications", description: "Choose notification preferences and how you want to be contacted", link: "/account-settings/notifications" },
  { icon: Globe, title: "Global preferences", description: "Set your default language, currency, and timezone", link: "/account-settings/preferences" },
  { icon: Eye, title: "Privacy & sharing", description: "Manage your personal data, connected services, and data sharing settings", link: "/account-settings/privacy-and-sharing" },
  { icon: Gift, title: "Referral credit & coupon", description: "You have $0 referral credits and coupon. Learn more.", link: "/account-settings/referrals" },
  { icon: Star, title: "My Reviews", description: "View and edit your reviews for completed bookings", link: "/account-settings/reviews" },
  { icon: Heart, title: "Wishlists & Recently Viewed", description: "Manage your saved wishlists and view recently viewed items", link: "/account-settings/wishlists" },
  { icon: MessageCircle, title: "Messages", description: "View and manage your messages with beauty partners and clients", link: "/account-settings/messages" },
  { icon: Briefcase, title: "Custom Requests", description: "Request custom services and manage offers from providers", link: "/account-settings/custom-requests" },
  // §Release-audit 2026-04: removed broken "Membership" card — there is no
  // /account-settings/membership route in the app, so taps resolved to a
  // slow Next.js 404. Customer-facing memberships are surfaced under the
  // partner profile and inside /account-settings/payments where applicable.
  { icon: ShieldCheck, title: "Identity Verification", description: "Verify your identity for a trusted experience", link: "/account-settings/verification/embed" },
  { icon: Info, title: "About Us", description: "Learn more about Beautonomi and our mission", link: "#about-us", isAction: true },
  { icon: Share2, title: "Share App", description: "Share Beautonomi with your friends and family", link: "#share-app", isAction: true },
];

type AccountHubGridProps = {
  /** When true, render for the profile page (no standalone “Account” page chrome). */
  embeddedInProfile?: boolean;
};

type HubLinkCardProps = {
  card: AccountHubCard;
  warmRoute: (href: string) => void;
};

const HubLinkCard = memo(function HubLinkCard({ card, warmRoute }: HubLinkCardProps) {
  const Icon = card.icon;
  return (
    <Link
      href={card.link}
      prefetch={false}
      onPointerEnter={() => warmRoute(card.link)}
      onFocus={() => warmRoute(card.link)}
      // §Release-audit 2026-04: touch devices never fire pointerEnter,
      // so without this the route chunk only starts loading AFTER the tap.
      // Warming on pointerDown gives the navigation a head start while the
      // tap-up event still has to travel through the gesture layer.
      onPointerDown={() => warmRoute(card.link)}
      onTouchStart={() => warmRoute(card.link)}
      className="block"
    >
      <div
        className={`p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border transition-[box-shadow,border-color] duration-200 h-full ${
          card.link === "/account-settings/loyalty"
            ? "bg-gradient-to-br from-white to-primary/5 border-primary/30 hover:border-primary/50"
            : "bg-white border-gray-100 hover:border-[#FF0077]/20"
        }`}
      >
        <Icon className="h-6 w-6 md:h-7 md:w-7 mb-3 md:mb-4 text-primary" />
        <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{card.title}</h2>
        <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{card.description}</p>
      </div>
    </Link>
  );
});
HubLinkCard.displayName = "HubLinkCard";

type HubActionCardProps = {
  card: AccountHubCard;
  onOpen: (card: AccountHubCard) => void;
};

const HubActionCard = memo(function HubActionCard({ card, onOpen }: HubActionCardProps) {
  const Icon = card.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card);
        }
      }}
      className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-[box-shadow,border-color] duration-200 h-full cursor-pointer"
    >
      <Icon className="h-6 w-6 md:h-7 md:w-7 mb-3 md:mb-4 text-primary" />
      <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{card.title}</h2>
      <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{card.description}</p>
    </div>
  );
});
HubActionCard.displayName = "HubActionCard";

export default function AccountHubGrid({ embeddedInProfile = false }: AccountHubGridProps) {
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const prefetchedHrefs = useRef(new Set<string>());

  /** With prefetch={false} on links, warm the route once on hover/focus so clicks feel instant. */
  const warmRoute = useCallback(
    (href: string) => {
      if (prefetchedHrefs.current.has(href)) return;
      prefetchedHrefs.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  // Warm common account routes once the grid is on-screen so the first tap
  // pays only for the destination RSC payload, not cold chunk discovery.
  useEffect(() => {
    const hrefs = ACCOUNT_HUB_CARDS.filter((c) => !c.isAction).map((c) => c.link);
    const run = () => {
      hrefs.forEach((h) => warmRoute(h));
      warmRoute("/provider/onboarding");
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 300);
    return () => window.clearTimeout(t);
  }, [warmRoute]);

  const openActionCard = useCallback((card: AccountHubCard) => {
    if (card.link === "#about-us") setShowAboutUs(true);
    else if (card.link === "#share-app") setShowShareApp(true);
  }, []);

  return (
    <>
      <div
        className={embeddedInProfile ? "rounded-xl border border-gray-100 bg-white p-4 md:p-6 shadow-sm" : ""}
      >
        {embeddedInProfile ? (
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">More</h2>
            <p className="text-sm text-gray-500 mt-1 font-light">
              Bookings, wallet, notifications, and security.
            </p>
          </div>
        ) : null}

        {/* Default Link prefetch would load ~25 routes as cards scroll into view; fetch on click/hover instead. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {ACCOUNT_HUB_CARDS.map((card, index) =>
            card.isAction ? (
              <HubActionCard key={`${card.link}-${index}`} card={card} onOpen={openActionCard} />
            ) : (
              <HubLinkCard key={`${card.link}-${index}`} card={card} warmRoute={warmRoute} />
            )
          )}
          {user && user.role === "customer" && (
            <Link
              href="/provider/onboarding"
              prefetch={false}
              onPointerEnter={() => warmRoute("/provider/onboarding")}
              onFocus={() => warmRoute("/provider/onboarding")}
              onPointerDown={() => warmRoute("/provider/onboarding")}
              onTouchStart={() => warmRoute("/provider/onboarding")}
              className="block"
            >
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-shadow duration-200 h-full">
                <Store className="h-6 w-6 md:h-7 md:w-7 mb-3 md:mb-4 text-primary" />
                <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">Become a Provider</h2>
                <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">
                  Start offering your beauty services on Beautonomi. Manage bookings, payments, and grow your business all in one place.
                </p>
              </div>
            </Link>
          )}
        </div>

      </div>

      {showAboutUs && (
        <Suspense fallback={null}>
          <AboutUsModal isOpen={showAboutUs} onClose={() => setShowAboutUs(false)} />
        </Suspense>
      )}
      {showShareApp && (
        <Suspense fallback={null}>
          <ShareAppModal isOpen={showShareApp} onClose={() => setShowShareApp(false)} />
        </Suspense>
      )}

    </>
  );
}

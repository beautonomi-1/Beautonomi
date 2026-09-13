"use client";

import Link from "next/link";
import React, { useState, lazy, Suspense, memo } from "react";
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
  BadgePercent,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";

const AboutUsModal = lazy(() => import("@/components/global/about-us-modal"));
const ShareAppModal = lazy(() => import("@/components/global/share-app-modal"));

export interface AccountHubCard {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
  link: string;
  isAction?: boolean;
}

export const ACCOUNT_HUB_CARDS: AccountHubCard[] = [
  { icon: User, titleKey: "customer.accountSettings.personalInfoTitle", descriptionKey: "web.accountSettings.hub.personalInfoDesc", link: "/account-settings/personal-info" },
  { icon: ShieldCheck, titleKey: "customer.accountSettings.loginSecurityTitle", descriptionKey: "web.accountSettings.hub.loginSecurityDesc", link: "/account-settings/login-and-security" },
  { icon: CreditCard, titleKey: "web.accountSettings.hub.paymentsTitle", descriptionKey: "web.accountSettings.hub.paymentsDesc", link: "/account-settings/payments" },
  { icon: Wallet, titleKey: "web.accountSettings.wallet.title", descriptionKey: "web.accountSettings.hub.walletDesc", link: "/account-settings/wallet" },
  { icon: BadgePercent, titleKey: "web.accountSettings.hub.membershipsTitle", descriptionKey: "web.accountSettings.hub.membershipsDesc", link: "/account-settings/membership" },
  { icon: Trophy, titleKey: "web.accountSettings.hub.loyaltyTitle", descriptionKey: "web.accountSettings.hub.loyaltyDesc", link: "/account-settings/loyalty" },
  { icon: FileText, titleKey: "web.accountSettings.taxes.title", descriptionKey: "web.accountSettings.hub.taxesDesc", link: "/account-settings/taxes" },
  { icon: MapPin, titleKey: "customer.accountSettings.savedAddressesTitle", descriptionKey: "web.accountSettings.hub.savedAddressesDesc", link: "/account-settings/addresses" },
  { icon: CalendarDays, titleKey: "customer.accountSettings.bookingsMenuTitle", descriptionKey: "web.accountSettings.hub.bookingsDesc", link: "/account-settings/bookings" },
  { icon: ShoppingBag, titleKey: "web.accountSettings.hub.productOrdersTitle", descriptionKey: "web.accountSettings.hub.productOrdersDesc", link: "/account-settings/orders" },
  { icon: Undo2, titleKey: "web.accountSettings.hub.returnsTitle", descriptionKey: "web.accountSettings.hub.returnsDesc", link: "/account-settings/returns" },
  { icon: CalendarDays, titleKey: "web.accountSettings.hub.recurringTitle", descriptionKey: "web.accountSettings.hub.recurringDesc", link: "/account-settings/recurring-bookings" },
  { icon: CalendarDays, titleKey: "customer.accountSettings.waitlistTitle", descriptionKey: "web.accountSettings.hub.waitlistDesc", link: "/account-settings/waitlist" },
  { icon: Bell, titleKey: "customer.notifications", descriptionKey: "web.accountSettings.hub.notificationsDesc", link: "/account-settings/notifications" },
  { icon: Globe, titleKey: "web.accountSettings.hub.globalPrefsTitle", descriptionKey: "web.accountSettings.hub.globalPrefsDesc", link: "/account-settings/preferences" },
  { icon: Eye, titleKey: "customer.accountSettings.privacySharingTitle", descriptionKey: "web.accountSettings.hub.privacyDesc", link: "/account-settings/privacy-and-sharing" },
  { icon: Gift, titleKey: "web.accountSettings.hub.referralTitle", descriptionKey: "web.accountSettings.hub.referralDesc", link: "/account-settings/referrals" },
  { icon: Star, titleKey: "web.accountSettings.hub.reviewsTitle", descriptionKey: "web.accountSettings.hub.reviewsDesc", link: "/account-settings/reviews" },
  { icon: Heart, titleKey: "web.accountSettings.hub.wishlistsTitle", descriptionKey: "web.accountSettings.hub.wishlistsDesc", link: "/account-settings/wishlists" },
  { icon: MessageCircle, titleKey: "customer.messages", descriptionKey: "web.accountSettings.hub.messagesDesc", link: "/account-settings/messages" },
  { icon: Briefcase, titleKey: "web.accountSettings.customRequests.title", descriptionKey: "web.accountSettings.hub.customRequestsDesc", link: "/account-settings/custom-requests" },
  { icon: ShieldCheck, titleKey: "web.accountSettings.hub.identityTitle", descriptionKey: "web.accountSettings.hub.identityDesc", link: "/account-settings/identity-verification" },
  { icon: Info, titleKey: "customer.mobile.stackTitles.aboutUs", descriptionKey: "web.accountSettings.hub.aboutUsDesc", link: "#about-us", isAction: true },
  { icon: Share2, titleKey: "web.accountSettings.hub.shareAppTitle", descriptionKey: "web.accountSettings.hub.shareAppDesc", link: "#share-app", isAction: true },
];

type AccountHubGridProps = {
  /** When true, render for the profile page (no standalone “Account” page chrome). */
  embeddedInProfile?: boolean;
};

type HubLinkCardProps = {
  card: AccountHubCard;
};

const HubLinkCard = memo(function HubLinkCard({ card }: HubLinkCardProps) {
  const { t } = useTranslation();
  const Icon = card.icon;
  return (
    <Link href={card.link} className="block">
      <div
        className={`p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border transition-[box-shadow,border-color] duration-200 h-full ${
          card.link === "/account-settings/loyalty"
            ? "bg-gradient-to-br from-white to-primary/5 border-primary/30 hover:border-primary/50"
            : "bg-white border-gray-100 hover:border-[#FF0077]/20"
        }`}
      >
        <Icon className="h-6 w-6 md:h-7 md:w-7 mb-3 md:mb-4 text-primary" />
        <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{t(card.titleKey)}</h2>
        <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{t(card.descriptionKey)}</p>
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
  const { t } = useTranslation();
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
      <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{t(card.titleKey)}</h2>
      <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">{t(card.descriptionKey)}</p>
    </div>
  );
});
HubActionCard.displayName = "HubActionCard";

export default function AccountHubGrid({ embeddedInProfile = false }: AccountHubGridProps) {
  const { t } = useTranslation();
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const { user } = useAuth();

  const openActionCard = (card: AccountHubCard) => {
    if (card.link === "#about-us") setShowAboutUs(true);
    else if (card.link === "#share-app") setShowShareApp(true);
  };

  return (
    <>
      <div
        className={embeddedInProfile ? "rounded-xl border border-gray-100 bg-white p-4 md:p-6 shadow-sm" : ""}
      >
        {embeddedInProfile ? (
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("common.more")}</h2>
            <p className="text-sm text-gray-500 mt-1 font-light">
              {t("web.accountSettings.hub.moreSubtitle")}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {ACCOUNT_HUB_CARDS.map((card, index) =>
            card.isAction ? (
              <HubActionCard key={`${card.link}-${index}`} card={card} onOpen={openActionCard} />
            ) : (
              <HubLinkCard key={`${card.link}-${index}`} card={card} />
            ),
          )}
          {user && user.role === "customer" && (
            <Link href="/provider/onboarding" className="block">
              <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm hover:shadow-md border border-gray-100 hover:border-[#FF0077]/20 transition-shadow duration-200 h-full">
                <Store className="h-6 w-6 md:h-7 md:w-7 mb-3 md:mb-4 text-primary" />
                <h2 className="text-lg md:text-xl font-medium mb-2 text-gray-900">{t("web.accountSettings.hub.becomeProviderTitle")}</h2>
                <p className="text-sm md:text-base text-gray-600 font-light leading-relaxed">
                  {t("web.accountSettings.hub.becomeProviderDesc")}
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

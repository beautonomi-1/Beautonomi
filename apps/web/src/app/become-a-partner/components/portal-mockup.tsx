"use client";

import React from "react";
import { PhoneFrame, type ProviderHighlightTab } from "@/components/mockups/PhoneFrame";
import {
  ProviderBookingsOverviewContent,
  ProviderCalendarContent,
  ProviderHouseCallsContent,
  ProviderMessagesContent,
  ProviderServicesContent,
} from "@/components/mockups/screens/provider-mobile";
import AppDownloadButtons from "./app-download-buttons";

interface PortalMockupProps {
  activeTab: string;
}

function tabHighlight(activeTab: string): ProviderHighlightTab {
  if (activeTab === "CALLS & TEXTS") return "chats";
  if (activeTab === "CUSTOM SERVICES") return "more";
  return "bookings";
}

function renderScreen(activeTab: string) {
  switch (activeTab) {
    case "ONLINE BOOKING":
      return <ProviderBookingsOverviewContent />;
    case "CUSTOM SERVICES":
      return <ProviderServicesContent />;
    case "CALLS & TEXTS":
      return <ProviderMessagesContent />;
    case "HOUSE CALLS":
      return <ProviderHouseCallsContent />;
    case "CALENDAR":
    default:
      return <ProviderCalendarContent />;
  }
}

const TAB_COPY: Record<string, { headline: string; body: string }> = {
  CALENDAR: {
    headline: "Your day, at a glance",
    body: "See every appointment on a beautiful mobile calendar — switch between day and overview in one tap.",
  },
  "ONLINE BOOKING": {
    headline: "Accept bookings 24/7",
    body: "Clients book online while you sleep. Confirm, manage, and track revenue from your phone.",
  },
  "CUSTOM SERVICES": {
    headline: "Your services, your way",
    body: "Build your catalogue with custom packages, pricing, and durations — exactly like the app.",
  },
  "CALLS & TEXTS": {
    headline: "Stay close to clients",
    body: "Message clients in one inbox. Quick replies, unread badges, and chat that feels native.",
  },
  "HOUSE CALLS": {
    headline: "Beauty on the go",
    body: "Manage house calls with journey steps, navigation, and a dedicated mobile workflow.",
  },
};

export default function PortalMockup({ activeTab }: PortalMockupProps) {
  const copy = TAB_COPY[activeTab] ?? TAB_COPY.CALENDAR;
  const highlight = tabHighlight(activeTab);

  return (
    <section id="app-demo" className="relative -mt-8 mb-12 scroll-mt-24 md:-mt-12 md:mb-20 lg:-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 md:mb-10 lg:mb-12" />

        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-center lg:gap-16">
          <div className="order-2 max-w-md text-center lg:order-1 lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Provider mobile app</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{copy.headline}</h2>
            <p className="mt-3 text-base leading-relaxed text-gray-600">{copy.body}</p>
            <div className="mt-8 hidden lg:block">
              <AppDownloadButtons />
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <PhoneFrame
              variant="provider"
              highlightTab={highlight}
              chatsBadge={activeTab === "CALLS & TEXTS" ? 2 : undefined}
              bookingsBadge={
                activeTab !== "CALLS & TEXTS" && activeTab !== "CUSTOM SERVICES" ? 3 : undefined
              }
            >
              {renderScreen(activeTab)}
            </PhoneFrame>
          </div>
        </div>

        <div className="mt-10 lg:hidden">
          <AppDownloadButtons />
        </div>
      </div>
    </section>
  );
}

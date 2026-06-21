"use client";

import React from "react";
import {
  Bell,
  Calendar,
  Grid3X3,
  Home,
  Menu,
  MessageSquare,
  Plus,
  Search,
  ShoppingCart,
  User,
  Users,
} from "lucide-react";
import { BeautonomiMark } from "./BeautonomiMark";

export type ProviderHighlightTab = "dashboard" | "clients" | "chats" | "bookings" | "more";
export type CustomerHighlightTab = "home" | "search" | "bookings" | "cart" | "chats" | "profile";

type PhoneFrameProps = {
  children: React.ReactNode;
  variant: "provider" | "customer";
  highlightTab: ProviderHighlightTab | CustomerHighlightTab;
  chatsBadge?: number;
  bookingsBadge?: number;
  className?: string;
};

export function PhoneFrame({
  children,
  variant,
  highlightTab,
  chatsBadge,
  bookingsBadge,
  className,
}: PhoneFrameProps) {
  const providerTabs = [
    { key: "dashboard" as const, label: "Dashboard", icon: Grid3X3 },
    { key: "clients" as const, label: "Clients", icon: Users },
    { key: "chats" as const, label: "Chats", icon: MessageSquare, badge: chatsBadge },
    { key: "bookings" as const, label: "Bookings", icon: Calendar, badge: bookingsBadge },
    { key: "more" as const, label: "More", icon: Menu },
  ];

  const customerTabs = [
    { key: "home" as const, label: "Home", icon: Home },
    { key: "search" as const, label: "Search", icon: Search },
    { key: "bookings" as const, label: "Bookings", icon: Calendar },
    { key: "cart" as const, label: "Cart", icon: ShoppingCart },
    { key: "chats" as const, label: "Chats", icon: MessageSquare, badge: chatsBadge },
    { key: "profile" as const, label: "Profile", icon: User },
  ];

  const tabs = variant === "provider" ? providerTabs : customerTabs;

  return (
    <div className={`relative mx-auto w-full max-w-[320px] sm:max-w-[340px] ${className ?? ""}`}>
      <div className="rounded-[2.5rem] border-[6px] border-gray-900 bg-gray-900 p-1 shadow-2xl shadow-gray-900/25">
        <div className="overflow-hidden rounded-[2rem] bg-white">
          <div className="flex items-center justify-between bg-white px-5 py-1.5 text-[10px] font-semibold text-gray-900">
            <span>9:41</span>
            <div className="h-5 w-[72px] rounded-full bg-gray-900" aria-hidden />
            <span className="flex gap-0.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gray-900" />
              <span className="h-2.5 w-2.5 rounded-sm bg-gray-900" />
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2.5">
            <BeautonomiMark className="h-6 w-6 text-primary" />
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-full p-1.5 text-gray-500" aria-hidden>
                <Search className="h-4 w-4" />
              </button>
              <button type="button" className="relative rounded-full p-1.5 text-gray-500" aria-hidden>
                <Bell className="h-4 w-4" />
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
              </button>
              {variant === "provider" ? (
                <button type="button" className="rounded-full bg-primary/10 p-1.5 text-primary" aria-hidden>
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="h-[420px] overflow-y-auto bg-white px-4 pb-2 pt-3 scrollbar-hide">{children}</div>

          <div className="flex border-t border-gray-100 bg-white px-1 pb-2 pt-1">
            {tabs.map((tab) => {
              const { key, label, icon: Icon, badge } = tab;
              const active = highlightTab === key;
              return (
                <div key={key} className="relative flex flex-1 flex-col items-center gap-0.5 py-1">
                  <div className="relative">
                    <Icon
                      className={`h-5 w-5 ${active ? "text-primary" : "text-gray-400"}`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    {badge ? (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white">
                        {badge}
                      </span>
                    ) : null}
                  </div>
                  <span className={`text-[9px] font-semibold leading-none ${active ? "text-primary" : "text-gray-400"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

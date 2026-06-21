"use client";

import React from "react";
import { Bell, Calendar, ChevronRight, Clock, Heart, MapPin, Package, Radio, Search, Star, Wallet } from "lucide-react";
import { PhoneFrame } from "../PhoneFrame";
import { BookingCard, ListRow, PillTabs, ScreenTitle, SettingsCard } from "../shared-ui";

export function CustomerHomeScreen() {
  const providers = [
    { name: "Glow Studio", rating: "4.9", area: "Sandton", service: "Hair & Nails" },
    { name: "Urban Spa", rating: "4.8", area: "Rosebank", service: "Massage & Wellness" },
  ];

  return (
    <PhoneFrame variant="customer" highlightTab="home">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Good morning</p>
          <h3 className="text-lg font-bold text-gray-900">Discover beauty nearby</h3>
        </div>
        <button type="button" className="rounded-full p-2 text-gray-500" aria-hidden>
          <Heart className="h-5 w-5" />
        </button>
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Search className="h-4 w-4 text-gray-400" />
        <span className="text-xs text-gray-400">Search services or providers</span>
      </div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">Featured near you</p>
      {providers.map((p) => (
        <div key={p.name} className="mb-2.5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="h-20 bg-gradient-to-br from-primary/20 to-pink-100" />
          <div className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{p.service}</p>
              </div>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                {p.rating}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              {p.area}
            </p>
            <button type="button" className="mt-2 w-full rounded-xl bg-primary py-2 text-xs font-semibold text-white">
              Book now
            </button>
          </div>
        </div>
      ))}
    </PhoneFrame>
  );
}

export function CustomerBookingsScreen() {
  return (
    <PhoneFrame variant="customer" highlightTab="bookings">
      <ScreenTitle title="Bookings" subtitle="Upcoming & past" />
      <div className="mb-3 flex gap-1 rounded-full bg-gray-100 p-1">
        {["Upcoming", "Past"].map((p, i) => (
          <button
            key={p}
            type="button"
            className={`flex-1 rounded-full py-1.5 text-[10px] font-semibold ${i === 0 ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <BookingCard
        time="Sat"
        endTime="14 Jul · 2:00 PM"
        service="Balayage & trim"
        client="Glow Studio · Sandton"
        status="Confirmed"
        statusColors="bg-green-100 text-green-800"
      />
      <BookingCard
        time="Wed"
        endTime="10 Jul · 11:00 AM"
        service="Express manicure"
        client="Urban Spa · Rosebank"
        status="Completed"
        statusColors="bg-gray-100 text-gray-600"
      />
      <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold text-gray-900">Tap a booking to reschedule, pay, or review</p>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function CustomerChatsScreen() {
  const chats = [
    { name: "Glow Studio", preview: "Your appointment is confirmed for Saturday", time: "Yesterday", unread: 1 },
    { name: "Urban Spa", preview: "Thanks for visiting us!", time: "Mon", unread: 0 },
  ];

  return (
    <PhoneFrame variant="customer" highlightTab="chats" chatsBadge={1}>
      <ScreenTitle title="Chats" subtitle="Messages with providers" />
      {chats.map((c) => (
        <div key={c.name} className="mb-2 flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-pink-200 text-xs font-bold text-primary">
            {c.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
              <span className="flex-shrink-0 text-[10px] text-gray-400">{c.time}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-gray-500">{c.preview}</p>
              {c.unread > 0 ? (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-medium text-white">
                  {c.unread}
                </span>
              ) : null}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
        </div>
      ))}
    </PhoneFrame>
  );
}

export function CustomerShopScreen() {
  const products = [
    { name: "Hydrating serum", price: "R320", provider: "Glow Studio" },
    { name: "Spa day package", price: "R1,850", provider: "Urban Spa", badge: "Package" },
  ];

  return (
    <PhoneFrame variant="customer" highlightTab="cart">
      <ScreenTitle title="Shop" subtitle="Products & packages" />
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Search className="h-4 w-4 text-gray-400" />
        <span className="text-xs text-gray-400">Search products or packages</span>
      </div>
      <PillTabs tabs={["All", "Products", "Packages"]} />
      {products.map((p) => (
        <ListRow
          key={p.name}
          icon={<Package className="h-4 w-4 text-gray-500" />}
          title={p.name}
          subtitle={`${p.provider} · ${p.price}`}
          badge={p.badge}
        />
      ))}
      <div className="mt-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs font-semibold text-gray-900">Check variants before checkout</p>
        <p className="mt-1 text-[10px] text-gray-600">Size, colour, and bundle options appear on the product page.</p>
      </div>
    </PhoneFrame>
  );
}

export function CustomerWalletScreen() {
  return (
    <PhoneFrame variant="customer" highlightTab="profile">
      <ScreenTitle title="Wallet & rewards" subtitle="Credits, coupons, and saved cards" />
      <div className="mb-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-pink-50 p-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold text-gray-900">Wallet balance</p>
        </div>
        <p className="mt-2 text-2xl font-bold text-gray-900">R250.00</p>
        <p className="text-xs text-gray-500">Applied automatically at checkout</p>
      </div>
      <SettingsCard
        title="Saved & offers"
        items={[
          { label: "Gift cards", subtitle: "2 active cards" },
          { label: "Coupons", subtitle: "SUMMER20 · 20% off", badge: "Active" },
          { label: "Loyalty points", subtitle: "480 pts · R48 value" },
          { label: "Saved cards", subtitle: "Visa ·••• 4242" },
        ]}
      />
    </PhoneFrame>
  );
}

export function CustomerProfileScreen() {
  return (
    <PhoneFrame variant="customer" highlightTab="profile">
      <ScreenTitle title="Profile" subtitle="Account, addresses, and support" />
      <div className="mb-3 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-pink-200 text-sm font-bold text-primary">
          TM
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Thandi Mokoena</p>
          <p className="text-xs text-gray-500">thandi@email.com</p>
        </div>
      </div>
      <SettingsCard
        items={[
          { label: "Notifications", subtitle: "Push, email, and SMS alerts", badge: "On" },
          { label: "Saved addresses", subtitle: "Home · Sandton" },
          { label: "Payment methods", subtitle: "Visa ·••• 4242" },
          { label: "Support tickets", subtitle: "View open requests" },
          { label: "Privacy & data", subtitle: "Account controls" },
        ]}
      />
      <ListRow icon={<Bell className="h-4 w-4 text-primary" />} title="Alert preferences" subtitle="Booking reminders and promos" />
    </PhoneFrame>
  );
}

export function CustomerOnDemandScreen() {
  return (
    <PhoneFrame variant="customer" highlightTab="search">
      <ScreenTitle title="On-demand request" subtitle="Finding a provider near you" />
      <div className="mb-3 rounded-2xl border border-gray-100 bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">Women&apos;s haircut</p>
        <div className="mt-2 space-y-1.5">
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            Sat 14 Jul · 2:00 PM
          </p>
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            Sandton · House call
          </p>
        </div>
      </div>
      <div className="mb-3 flex flex-col items-center rounded-2xl border border-primary/20 bg-primary/5 px-4 py-6">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Radio className="h-6 w-6 animate-pulse text-primary" />
        </div>
        <p className="text-sm font-semibold text-gray-900">Finding a provider</p>
        <p className="mt-1 text-center text-xs text-gray-500">Matching your service, time, and location</p>
        <div className="mt-3 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[10px] font-medium text-gray-500">Usually under 2 minutes</span>
        </div>
      </div>
      <div className="rounded-2xl border-2 border-primary/30 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Offer received</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">Glow Studio · 4.9 ★</p>
        <p className="text-xs text-gray-500">R450 · Available at your requested time</p>
        <button type="button" className="mt-3 w-full rounded-xl bg-primary py-2 text-xs font-semibold text-white">
          Accept &amp; pay
        </button>
      </div>
    </PhoneFrame>
  );
}

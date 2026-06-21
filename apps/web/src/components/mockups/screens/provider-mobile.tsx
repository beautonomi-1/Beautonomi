"use client";

import React from "react";
import {
  ChevronRight,
  CreditCard,
  Home,
  MapPin,
  Navigation,
  Package,
  Plus,
  Scissors,
  Search,
} from "lucide-react";
import { PhoneFrame, type ProviderHighlightTab } from "../PhoneFrame";
import { BookingCard, KpiCard, ListRow, ScreenTitle, SettingsCard } from "../shared-ui";

function wrapProvider(
  highlightTab: ProviderHighlightTab,
  content: React.ReactNode,
  opts?: { chatsBadge?: number; bookingsBadge?: number },
) {
  return (
    <PhoneFrame variant="provider" highlightTab={highlightTab} chatsBadge={opts?.chatsBadge} bookingsBadge={opts?.bookingsBadge}>
      {content}
    </PhoneFrame>
  );
}

export function ProviderCalendarContent() {
  const days = [
    { label: "Mon", num: "15", selected: false },
    { label: "Tue", num: "16", selected: true },
    { label: "Wed", num: "17", selected: false },
    { label: "Thu", num: "18", selected: false },
    { label: "Fri", num: "19", selected: false },
  ];

  return (
    <>
      <ScreenTitle
        title="Bookings"
        subtitle="Today · 3 appointments"
        action={
          <button type="button" className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white">
            New
          </button>
        }
      />
      <div className="mb-3 flex rounded-2xl bg-primary/5 p-1">
        <button type="button" className="flex-1 rounded-xl bg-white py-1.5 text-xs font-semibold text-gray-900 shadow-sm">
          Day
        </button>
        <button type="button" className="flex-1 py-1.5 text-xs font-medium text-gray-500">
          Overview
        </button>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-hidden">
        {days.map((d) => (
          <div
            key={d.num}
            className={`flex w-14 flex-shrink-0 flex-col items-center rounded-[14px] py-2 ${d.selected ? "bg-primary text-white" : ""}`}
          >
            <span className={`text-[11px] font-semibold ${d.selected ? "text-white" : "text-gray-500"}`}>{d.label}</span>
            <span className={`mt-0.5 text-[17px] font-bold ${d.selected ? "text-white" : "text-gray-900"}`}>{d.num}</span>
          </div>
        ))}
      </div>
      <div className="mb-3 rounded-3xl border border-gray-100 bg-white p-3">
        <p className="text-base font-bold text-gray-900">Tuesday, 16 Jul</p>
        <p className="text-xs text-gray-500">3 appointments · R2,450 booked</p>
      </div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Morning</p>
      <BookingCard
        time="10:00"
        endTime="11:00"
        service="Women's haircut"
        client="Laura Johnson"
        status="Confirmed"
        statusColors="bg-green-100 text-green-800"
        accent="border-l-blue-500"
      />
      <p className="mb-1.5 mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">Afternoon</p>
      <BookingCard
        time="14:00"
        endTime="16:00"
        service="Full highlight"
        client="Kesha Williamson"
        status="In progress"
        statusColors="bg-primary/10 text-primary"
      />
    </>
  );
}

export function ProviderBookingsOverviewContent() {
  return (
    <>
      <ScreenTitle title="Bookings" subtitle="Overview" />
      <div className="mb-3 flex gap-1 rounded-full bg-gray-100 p-1">
        {["Today", "Week", "Month", "All"].map((p, i) => (
          <button
            key={p}
            type="button"
            className={`flex-1 rounded-full py-1 text-[10px] font-semibold ${i === 0 ? "bg-gray-900 text-white" : "text-gray-500"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-200 bg-white p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Appointments</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">12</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Pending</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">5</p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Active</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">3</p>
        </div>
        <div className="rounded-xl border border-pink-200 bg-pink-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-pink-700">Earned</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">R4.2k</p>
        </div>
      </div>
      <BookingCard
        time="15:00"
        endTime="16:00"
        service="Beard trim"
        client="James Brown"
        status="Pending"
        statusColors="bg-amber-100 text-amber-800"
        traits={["Online"]}
      />
    </>
  );
}

export function ProviderServicesContent() {
  const services = [
    { name: "Women's cut & blow dry", price: "R450", duration: "60 min" },
    { name: "Balayage full head", price: "R1,200", duration: "180 min" },
    { name: "Express manicure", price: "R280", duration: "45 min" },
  ];

  return (
    <>
      <ScreenTitle
        title="Services"
        subtitle="Catalogue & pricing"
        action={
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Plus className="h-4 w-4" />
          </button>
        }
      />
      <div className="mb-3 border-l-4 border-pink-500 pl-2">
        <p className="text-sm font-semibold text-gray-900">Hair</p>
        <p className="text-xs text-gray-500">4 services</p>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white">
        {services.map((s, i) => (
          <div
            key={s.name}
            className={`flex items-center gap-3 px-3 py-3 ${i < services.length - 1 ? "border-b border-gray-100" : ""}`}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
              <Scissors className="h-4 w-4 text-gray-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-500">{s.duration}</p>
            </div>
            <p className="text-sm font-medium text-indigo-600">{s.price}</p>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
          </div>
        ))}
      </div>
    </>
  );
}

export function ProviderMessagesContent() {
  const inbox = [
    { name: "Sarah Davis", preview: "Can I reschedule my appointment?", time: "2:00 PM", unread: 2 },
    { name: "Michael Chen", preview: "Thank you for the great service!", time: "1:45 PM", unread: 0 },
  ];

  return (
    <>
      <ScreenTitle title="Messages" subtitle="24 conversations" />
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
        <Search className="h-4 w-4 text-gray-400" />
        <span className="text-xs text-gray-400">Search conversations</span>
      </div>
      {inbox.map((c) => (
        <div key={c.name} className="mb-2 flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-300 to-purple-400 text-xs font-bold text-white">
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
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-medium text-white">
                  {c.unread}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function ProviderHouseCallsContent() {
  return (
    <>
      <ScreenTitle title="Appointment" subtitle="House call · Today 2:00 PM" />
      <div className="mb-3 rounded-3xl border-2 border-primary/20 bg-primary/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold text-primary">House call</p>
        </div>
        <p className="mb-2 text-sm font-semibold text-gray-900">Sarah Johnson</p>
        <p className="mb-3 text-xs text-gray-600">Full facial treatment · 90 min</p>
        <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-white px-3 py-2">
          <Navigation className="h-4 w-4 flex-shrink-0 text-primary" />
          <p className="truncate text-xs font-medium text-gray-800">123 Main St, Sandton</p>
          <MapPin className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        </div>
      </div>
      <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Journey steps</p>
        <div className="flex gap-2">
          <button type="button" className="flex-1 rounded-lg bg-primary py-2 text-[11px] font-semibold text-white">
            Start journey
          </button>
          <button type="button" className="flex-1 rounded-lg border border-gray-200 py-2 text-[11px] font-semibold text-gray-700">
            Mark arrived
          </button>
        </div>
      </div>
    </>
  );
}

export function ProviderDashboardContent() {
  return (
    <>
      <ScreenTitle title="Dashboard" subtitle="Today · Sandton Studio" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-200 bg-white p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Today</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">8 bookings</p>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Available</p>
          <p className="mt-0.5 text-lg font-bold text-gray-900">R12.4k</p>
        </div>
      </div>
      <BookingCard
        time="10:30"
        endTime="11:30"
        service="Gel manicure"
        client="Thandi M."
        status="Confirmed"
        statusColors="bg-green-100 text-green-800"
      />
    </>
  );
}

export const ProviderCalendarScreen = () => wrapProvider("bookings", <ProviderCalendarContent />, { bookingsBadge: 3 });
export const ProviderBookingsOverviewScreen = () => wrapProvider("bookings", <ProviderBookingsOverviewContent />, { bookingsBadge: 3 });
export const ProviderServicesScreen = () => wrapProvider("more", <ProviderServicesContent />);
export const ProviderMessagesScreen = () => wrapProvider("chats", <ProviderMessagesContent />, { chatsBadge: 2 });
export const ProviderHouseCallsScreen = () => wrapProvider("bookings", <ProviderHouseCallsContent />, { bookingsBadge: 3 });
export const ProviderDashboardScreen = () => wrapProvider("dashboard", <ProviderDashboardContent />);

export function ProviderFinanceContent() {
  return (
    <>
      <ScreenTitle title="Finance" subtitle="Earnings & payouts" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <KpiCard label="Available" value="R12.4k" tone="primary" />
        <KpiCard label="This week" value="R18.2k" tone="green" />
      </div>
      <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold text-gray-900">Request payout to verified bank account</p>
        </div>
        <button type="button" className="mt-2 w-full rounded-xl bg-primary py-2 text-xs font-semibold text-white">
          Request payout
        </button>
      </div>
      <SettingsCard
        title="Payments"
        items={[
          { label: "Yoco devices", subtitle: "2 terminals connected" },
          { label: "Payout bank accounts", subtitle: "FNB ·••• 4521 · Verified", badge: "Default" },
          { label: "Sales history", subtitle: "Walk-in and online" },
        ]}
      />
    </>
  );
}

export function ProviderPackagesContent() {
  const packages = [
    { name: "Bridal glow package", price: "R2,400", sessions: "3 sessions" },
    { name: "Monthly membership", price: "R899/mo", sessions: "Unlimited manicures" },
  ];

  return (
    <>
      <ScreenTitle title="Packages & memberships" subtitle="Offers for customers" />
      {packages.map((p) => (
        <ListRow
          key={p.name}
          icon={<Package className="h-4 w-4 text-gray-500" />}
          title={p.name}
          subtitle={`${p.sessions} · ${p.price}`}
        />
      ))}
      <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-600">Variant selections and bulk edits are faster on the web portal.</p>
      </div>
    </>
  );
}

export function ProviderMoreContent() {
  return (
    <>
      <ScreenTitle title="More" subtitle="Finance, settings, and support" />
      <SettingsCard
        items={[
          { label: "Finance & payouts", subtitle: "Balance, Yoco, bank accounts" },
          { label: "Services catalogue", subtitle: "Pricing and categories" },
          { label: "Packages & memberships", subtitle: "Customer offers" },
          { label: "Locations", subtitle: "Sandton Studio · Rosebank" },
          { label: "Subscription plan", subtitle: "Professional · Active", badge: "Pro" },
          { label: "Setup checklist", subtitle: "4 of 6 complete", badge: "67%" },
          { label: "Help & support", subtitle: "Tickets and learning center" },
        ]}
      />
    </>
  );
}

export const ProviderFinanceScreen = () => wrapProvider("more", <ProviderFinanceContent />);
export const ProviderPackagesScreen = () => wrapProvider("more", <ProviderPackagesContent />);
export const ProviderMoreScreen = () => wrapProvider("more", <ProviderMoreContent />);

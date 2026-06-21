"use client";

import React from "react";
import {
  Calendar,
  CreditCard,
  Link2,
  Megaphone,
  Package,
  Scissors,
  Settings,
  Shield,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { BrowserFrame } from "../BrowserFrame";
import { KpiCard, ListRow, PillTabs, ScreenSection, TableRow } from "../shared-ui";

export function ProviderWebCalendarScreen() {
  const days = ["Mon 15", "Tue 16", "Wed 17", "Thu 18", "Fri 19"];
  const slots = [
    { time: "10:00", service: "Women's haircut", client: "Laura J.", status: "Confirmed" },
    { time: "14:00", service: "Full highlight", client: "Kesha W.", status: "In progress" },
  ];

  return (
    <BrowserFrame title="Calendar" url="beautonomi.co.za/provider/calendar">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Provider portal</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Calendar</h3>
        <p className="text-sm text-gray-500">Tuesday, 16 Jul · Week view</p>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {days.map((d, i) => (
          <div
            key={d}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-center text-xs font-semibold ${
              i === 1 ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600"
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {slots.map((s) => (
          <div key={s.time} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <span className="text-sm font-bold text-gray-900">{s.time}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{s.service}</p>
              <p className="truncate text-xs text-gray-500">{s.client}</p>
            </div>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">{s.status}</span>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function ProviderWebFinanceScreen() {
  return (
    <BrowserFrame title="Finance" url="beautonomi.co.za/provider/finance">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Finance</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Earnings & payouts</h3>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Available" value="R12.4k" tone="primary" />
        <KpiCard label="This week" value="R18.2k" tone="green" />
        <KpiCard label="Pending" value="R2.1k" tone="amber" />
        <KpiCard label="Refunded" value="R450" tone="default" />
      </div>
      <ScreenSection title="Payout bank accounts" subtitle="Verified accounts for withdrawals">
        <ListRow title="FNB Business ·••• 4521" subtitle="Default · Verified" badge="Active" />
        <button type="button" className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white">
          Request payout
        </button>
      </ScreenSection>
    </BrowserFrame>
  );
}

export function ProviderWebOrdersScreen() {
  return (
    <BrowserFrame title="Orders" url="beautonomi.co.za/provider/sales">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">E-commerce</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Product orders</h3>
      </div>
      <div className="mt-4">
        <PillTabs tabs={["New (3)", "Processing", "Shipped", "Completed"]} />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <TableRow header cells={["Order", "Customer", "Total", "Status"]} />
        <TableRow cells={["#4821", "Thandi M.", "R320", "New"]} />
        <TableRow cells={["#4819", "James B.", "R1,850", "Processing"]} />
        <TableRow cells={["#4815", "Sarah D.", "R450", "Shipped"]} />
      </div>
    </BrowserFrame>
  );
}

export function ProviderWebClientsScreen() {
  return (
    <BrowserFrame title="Clients" url="beautonomi.co.za/provider/clients">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">CRM</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Clients</h3>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <TableRow header cells={["Client", "Last visit", "Bookings", "LTV"]} />
        <TableRow cells={["Thandi Mokoena", "12 Jul", "8", "R4.2k"]} />
        <TableRow cells={["Laura Johnson", "10 Jul", "12", "R6.8k"]} />
        <TableRow cells={["James Brown", "8 Jul", "3", "R1.1k"]} />
      </div>
      <ScreenSection title="Client profile" subtitle="Thandi Mokoena">
        <p className="text-xs text-gray-600">Notes, booking history, messages, and tags in one place.</p>
      </ScreenSection>
    </BrowserFrame>
  );
}

export function ProviderWebTeamScreen() {
  return (
    <BrowserFrame title="Team" url="beautonomi.co.za/provider/team/members">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Team</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Staff & permissions</h3>
      </div>
      <div className="mt-4 space-y-2">
        {[
          { name: "Nomsa K.", role: "Senior stylist", access: "Full calendar" },
          { name: "James T.", role: "Reception", access: "Front desk only" },
        ].map((m) => (
          <ListRow key={m.name} icon={<Users className="h-4 w-4 text-gray-500" />} title={m.name} subtitle={`${m.role} · ${m.access}`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <KpiCard label="Shifts this week" value="24" tone="default" />
        <KpiCard label="Roles" value="3" tone="primary" />
      </div>
    </BrowserFrame>
  );
}

export function ProviderWebReportsScreen() {
  return (
    <BrowserFrame title="Reports" url="beautonomi.co.za/provider/reports">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Analytics</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Reports</h3>
      </div>
      <div className="mt-4">
        <PillTabs tabs={["Today", "Week", "Month", "Custom"]} activeIndex={2} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <KpiCard label="Revenue" value="R42.6k" tone="green" />
        <KpiCard label="Bookings" value="86" tone="primary" />
        <KpiCard label="New clients" value="14" tone="default" />
        <KpiCard label="Avg ticket" value="R495" tone="amber" />
      </div>
      <div className="mt-4 flex h-24 items-end gap-1 rounded-xl border border-gray-200 bg-white p-4">
        {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-primary/20" style={{ height: `${h}%` }}>
            <div className="h-full rounded-t bg-primary/60" style={{ height: `${h * 0.7}%` }} />
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

export function ProviderWebCatalogueScreen() {
  return (
    <BrowserFrame title="Catalogue" url="beautonomi.co.za/provider/catalogue">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Catalogue</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Services, products & offers</h3>
      </div>
      <div className="mt-4 space-y-2">
        <ListRow icon={<Scissors className="h-4 w-4 text-gray-500" />} title="Services" subtitle="12 active · Hair, Nails, Skin" />
        <ListRow icon={<Package className="h-4 w-4 text-gray-500" />} title="Packages" subtitle="3 bundles with variants" />
        <ListRow icon={<ShoppingBag className="h-4 w-4 text-gray-500" />} title="Products" subtitle="24 SKUs in stock" />
        <ListRow icon={<CreditCard className="h-4 w-4 text-gray-500" />} title="Memberships" subtitle="2 recurring plans" />
      </div>
    </BrowserFrame>
  );
}

export function ProviderWebSettingsScreen() {
  return (
    <BrowserFrame title="Settings" url="beautonomi.co.za/provider/settings">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Settings</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Business configuration</h3>
      </div>
      <div className="mt-4 space-y-2">
        <ListRow icon={<CreditCard className="h-4 w-4 text-gray-500" />} title="Yoco integration" subtitle="2 devices · Walk-in payments" />
        <ListRow icon={<Link2 className="h-4 w-4 text-gray-500" />} title="Online booking links" subtitle="Public and express links" />
        <ListRow icon={<Calendar className="h-4 w-4 text-gray-500" />} title="Locations & addresses" subtitle="Sandton · Rosebank" />
        <ListRow icon={<TrendingUp className="h-4 w-4 text-gray-500" />} title="Subscription plan" subtitle="Professional · Renews 1 Aug" badge="Active" />
        <ListRow icon={<Shield className="h-4 w-4 text-gray-500" />} title="Security & privacy" subtitle="Roles, 2FA, data rights" />
        <ListRow icon={<Settings className="h-4 w-4 text-gray-500" />} title="Receipts & invoices" subtitle="Branding and email templates" />
      </div>
    </BrowserFrame>
  );
}

export function ProviderWebMarketingScreen() {
  return (
    <BrowserFrame title="Marketing" url="beautonomi.co.za/provider/marketing">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Marketing</p>
        <h3 className="mt-1 text-xl font-bold text-gray-900">Campaigns &amp; promo codes</h3>
      </div>
      <div className="mt-4">
        <PillTabs tabs={["Campaigns", "Promo codes", "Automations"]} />
      </div>
      <div className="mt-4 space-y-2">
        <ListRow
          icon={<Megaphone className="h-4 w-4 text-gray-500" />}
          title="Summer glow campaign"
          subtitle="Email · 842 sent · 12% open rate"
          badge="Active"
        />
        <ListRow
          icon={<Tag className="h-4 w-4 text-gray-500" />}
          title="SUMMER20"
          subtitle="20% off · Valid until 31 Aug"
          badge="Live"
        />
        <ListRow
          icon={<Tag className="h-4 w-4 text-gray-500" />}
          title="NEWCLIENT"
          subtitle="R100 off first booking"
        />
      </div>
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs font-semibold text-gray-900">Share promo codes on your profile, in chats, or on social</p>
      </div>
    </BrowserFrame>
  );
}

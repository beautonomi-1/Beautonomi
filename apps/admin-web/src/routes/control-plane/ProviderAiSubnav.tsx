import { NavLink } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";

const TABS = [
  { label: "Settings", to: "/admin/control-plane/modules/ai", end: true },
  { label: "Templates", to: "/admin/control-plane/modules/ai/templates", end: false },
  { label: "Usage", to: "/admin/control-plane/modules/ai/usage", end: false },
  { label: "Entitlements", to: "/admin/control-plane/modules/ai/entitlements", end: false },
] as const;

export function ProviderAiSubnav() {
  return (
    <nav aria-label="Provider AI sections" className="flex gap-1 border-b border-gray-200">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={adminSpaTo(tab.to)}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              isActive ? "border-b-2 border-primary text-primary" : "text-gray-500 hover:text-gray-800"
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

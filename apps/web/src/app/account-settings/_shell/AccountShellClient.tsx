"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ACCOUNT_QUICK_LINKS, CUSTOMER_PRIMARY_ROUTES } from "./primary-routes";

export function AccountShellClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;
    CUSTOMER_PRIMARY_ROUTES.forEach((route) => router.prefetch(route));
  }, [router]);

  return (
    <>
      <div className="sticky top-[4rem] z-40 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-[2340px] mx-auto px-3 md:px-6 lg:px-12 py-2">
          <nav
            className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin touch-pan-x"
            aria-label="Account sections"
          >
            {ACCOUNT_QUICK_LINKS.map(({ href, label }) => {
              const active =
                href === "/account-settings"
                  ? pathname === "/account-settings"
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors md:text-sm",
                    active
                      ? "bg-[#FF0077] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}

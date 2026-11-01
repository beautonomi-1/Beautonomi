"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { cn } from "@/lib/utils";

const CURRENT_LABEL = {
  giftCards: "web.giftCard.breadcrumb.giftCards",
  purchase: "web.giftCard.breadcrumb.purchase",
  purchaseBulk: "web.giftCard.breadcrumb.purchaseBulk",
  confirmation: "web.giftCard.breadcrumb.confirmation",
  cancelled: "web.giftCard.breadcrumb.cancelled",
  claim: "web.giftCard.breadcrumb.claim",
} as const;

export type GiftCardBreadcrumbCurrent = keyof typeof CURRENT_LABEL;

type Crumb = { labelKey: string; href?: string };

/**
 * Public gift-card trail from the route tree:
 * / → /gift-card → /gift-card/purchase → confirmation | cancelled
 * / → /gift-card → /gift-card/claim
 * The current page is text. Ancestors are links. Account settings is not a parent.
 */
function trail(current: GiftCardBreadcrumbCurrent): Crumb[] {
  const home: Crumb = { labelKey: "web.giftCard.breadcrumb.home", href: "/" };
  const giftCards: Crumb = { labelKey: "web.giftCard.breadcrumb.giftCards", href: "/gift-card" };
  const purchase: Crumb = { labelKey: "web.giftCard.breadcrumb.purchase", href: "/gift-card/purchase" };
  const currentCrumb: Crumb = { labelKey: CURRENT_LABEL[current] };

  if (current === "giftCards") return [home, currentCrumb];
  if (current === "purchase" || current === "purchaseBulk") return [home, giftCards, currentCrumb];
  if (current === "confirmation" || current === "cancelled") {
    return [home, giftCards, purchase, currentCrumb];
  }
  return [home, giftCards, currentCrumb];
}

export function GiftCardBreadcrumb({
  current,
  className,
}: {
  current: GiftCardBreadcrumbCurrent;
  className?: string;
}) {
  const { t } = useTranslation();
  const items = trail(current);

  return (
    <nav className={cn("mb-6", className)} aria-label={t("web.giftCard.breadcrumb.navLabel")}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const label = t(item.labelKey);
          return (
            <li key={`${item.labelKey}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-secondary/35" aria-hidden />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-sm text-secondary/60 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {label}
                </Link>
              ) : (
                <span className="font-medium text-secondary" aria-current="page">
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

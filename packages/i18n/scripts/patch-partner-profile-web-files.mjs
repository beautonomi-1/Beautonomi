#!/usr/bin/env node
/**
 * Wires leftover partner-profile / search / login chrome to existing i18n keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function patch(rel, mutations) {
  const filePath = path.join(root, rel);
  let s = fs.readFileSync(filePath, "utf8");
  const before = s;
  for (const [from, to] of mutations) {
    if (!s.includes(from)) {
      console.warn("skip missing:", rel, JSON.stringify(from).slice(0, 80));
      continue;
    }
    s = s.split(from).join(to);
  }
  if (s !== before) {
    fs.writeFileSync(filePath, s);
    console.log("patched", rel);
  } else {
    console.log("unchanged", rel);
  }
}

const hookImport = 'import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";\n';

{
  const p = "apps/web/src/app/partner-profile/components/partner-services.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import { useLocale } from "@/components/i18n/LocaleProvider";\n',
      'import { useLocale } from "@/components/i18n/LocaleProvider";\n' + hookImport,
    );
    s = s.replace(
      "  const router = useRouter();\n  const { formatLocale } = useLocale();",
      "  const router = useRouter();\n  const { formatLocale } = useLocale();\n  const { t, pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    ['setError("Provider identifier is required");', "setError(pp(\"providerIdRequired\"));"],
    ['<LoadingTimeout loadingMessage="Loading services..." />', "<LoadingTimeout loadingMessage={pp(\"loadingServices\")} />"],
    ['<EmptyState title="Unable to load services" description={error} />', "<EmptyState title={pp(\"unableToLoadServices\")} description={error} />"],
    [
      '<EmptyState title="No services available" description="This provider hasn\'t added bookable services yet" />',
      "<EmptyState title={pp(\"noServicesAvailable\")} description={pp(\"noServicesHint\")} />",
    ],
    ['<h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Services</h2>', "<h2 className=\"text-xl md:text-2xl font-semibold mb-4 md:mb-6\">{pp(\"tabServices\")}</h2>"],
    ['aria-label="Scroll left"', 'aria-label={t("web.a11y.scrollLeft")}'],
    ['aria-label="Scroll right"', 'aria-label={t("web.a11y.scrollRight")}'],
    ["{service.variants.length} options", "{pp(\"optionsCount\", { count: service.variants.length })}"],
    ["{chosen ? `${chosen.duration_minutes} min` : `${service.duration_minutes} min`}", "{chosen ? pp(\"durationMinutes\", { minutes: chosen.duration_minutes }) : pp(\"durationMinutes\", { minutes: service.duration_minutes })}"],
    ["{hasVariants ? <>From {priceLabel}</> : priceLabel}", "{hasVariants ? <>{pp(\"fromPrefix\")}{priceLabel}</> : priceLabel}"],
    ['Selected:{" "}', "{pp(\"selectedPrefix\")}{\" \"}"],
    ["<span>Details</span>", "<span>{pp(\"detailsCta\")}</span>"],
    [">\n                      Book\n                    </button>", ">\n                      {pp(\"bookCta\")}\n                    </button>"],
    [
      '{variantSectionExpanded ? "Hide options" : `Choose from ${service.variants.length} option${service.variants.length !== 1 ? "s" : ""}`}',
      "{variantSectionExpanded ? pp(\"hideOptions\") : pp(\"chooseFromOptions\", { count: service.variants.length })}",
    ],
    [
      "Pick the option that matches what you need — your booking will use this exact service.",
      "{pp(\"pickExactOption\")}",
    ],
    ["{v.duration_minutes} min", "{pp(\"durationMinutes\", { minutes: v.duration_minutes })}"],
    ["Book selected option", "{pp(\"bookSelectedOption\")}"],
    ["View all services", "{pp(\"viewAllServices\")}"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-reviews.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import EmptyState from "@/components/ui/empty-state";\n',
      'import EmptyState from "@/components/ui/empty-state";\n' + hookImport,
    );
    s = s.replace(
      "  const [showAll, setShowAll] = useState(false);",
      "  const [showAll, setShowAll] = useState(false);\n  const { pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    [': "Failed to load reviews";', ": pp(\"failedLoadReviews\");"],
    ['if (!name || /anon/i.test(name.trim())) return "Verified customer";', "if (!name || /anon/i.test(name.trim())) return pp(\"verifiedCustomer\");"],
    ['<LoadingTimeout loadingMessage="Loading reviews..." />', "<LoadingTimeout loadingMessage={pp(\"loadingReviews\")} />"],
    ['title="Failed to load reviews"', "title={pp(\"failedLoadReviews\")}"],
    ['<h2 className="text-2xl font-semibold mb-6">Reviews</h2>', "<h2 className=\"text-2xl font-semibold mb-6\">{pp(\"tabReviews\")}</h2>"],
    ['title="No reviews yet"', "title={pp(\"noReviewsYet\")}"],
    [
      'description="This provider hasn\'t received any reviews yet. Be the first to review!"',
      "description={pp(\"noReviewsHint\")}",
    ],
    ["Customer reviews", "{pp(\"customerReviews\")}"],
    [
      '{voteCount.toLocaleString()} {voteCount === 1 ? "review" : "reviews"}',
      "{voteCount === 1 ? pp(\"reviewCountLabelOne\", { count: voteCount }) : pp(\"reviewCountLabelOther\", { count: voteCount.toLocaleString() })}",
    ],
    ["Provider reply", "{pp(\"providerReply\")}"],
    ["See all {reviews.length} reviews", "{pp(\"seeAllReviews\", { count: reviews.length })}"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-about.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import type { ViewerTier } from "@/lib/providers/provider-disclosure";\n',
      'import type { ViewerTier } from "@/lib/providers/provider-disclosure";\n' + hookImport,
    );
    s = s.replace(
      "  isAuthenticated = false,\n}) => {",
      "  isAuthenticated = false,\n}) => {\n  const { t, pp } = usePartnerProfileT();\n  const dayKeys = [\n    [\"monday\", \"dayMonday\"],\n    [\"tuesday\", \"dayTuesday\"],\n    [\"wednesday\", \"dayWednesday\"],\n    [\"thursday\", \"dayThursday\"],\n    [\"friday\", \"dayFriday\"],\n    [\"saturday\", \"daySaturday\"],\n    [\"sunday\", \"daySunday\"],\n  ] as const;",
    );
  }
  s = s.replace(
    'const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];\n    return days.map((day) => {\n      const normalized = normalizeDayHours(readDayValue(hoursData, day));\n      if (!normalized || normalized.closed || !normalized.open || !normalized.close) {\n        return { day: day.charAt(0).toUpperCase() + day.slice(1), hours: "Closed" };\n      }\n      return {\n        day: day.charAt(0).toUpperCase() + day.slice(1),\n        hours: `${normalized.open} - ${normalized.close}`,\n      };\n    });',
    "return dayKeys.map(([day, key]) => {\n      const normalized = normalizeDayHours(readDayValue(hoursData, day));\n      if (!normalized || normalized.closed || !normalized.open || !normalized.close) {\n        return { day: pp(key), hours: pp(\"closed\") };\n      }\n      return {\n        day: pp(key),\n        hours: `${normalized.open} - ${normalized.close}`,\n      };\n    });",
  );
  const reps = [
    ['<h2 className="text-2xl font-semibold mb-6">About</h2>', "<h2 className=\"text-2xl font-semibold mb-6\">{pp(\"tabAbout\")}</h2>"],
    [
      '            <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">\n              Sign in\n            </Link>{" "}\n            to read the full description, opening times, and location details.',
      '            <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">\n              {t("web.a11y.signIn")}\n            </Link>{" "}\n            {pp("signInToReadAbout").replace(t("web.a11y.signIn\"), "").trim()}',
    ],
    [
      '{aboutDescription || "This provider hasn\'t added a description yet."}',
      "{aboutDescription || pp(\"noDescriptionYet\")}",
    ],
    ["Opening times", "{pp(\"openingTimes\")}"],
    ["Additional information", "{pp(\"additionalInformation\")}"],
    ["Instant Confirmation", "{pp(\"instantConfirmation\")}"],
    ["Location", "{pp(\"locationFallback\")}"],
    ["Get directions", "{pp(\"directionsCta\")}"],
    ['Service area:{" "}', "{pp(\"serviceArea\", { area: \"\" }).replace(/:\\s*$/, \": \")}"],
    [
      "Exact address is shared after booking confirmation.",
      "{pp(\"exactAddressAfterBooking\")}",
    ],
  ];
  for (const [from, to] of reps) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  // Fix the broken sign-in line if the replace above failed or mangled
  if (s.includes('signInToReadAbout").replace')) {
    s = s.replace(
      /<Link href="\/login" className="text-blue-600 hover:text-blue-800 underline">\s*\{t\("web\.a11y\.signIn"\)\}\s*<\/Link>\{\s*" "\s*\}\s*\{pp\("signInToReadAbout"\)\.replace\([^}]+\}\s*/,
      `<p className="text-gray-600 leading-relaxed">{pp("signInToReadAbout")}</p>\n            `,
    );
  }
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-photos.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import { ProviderGalleryImage } from "@beautonomi/ui/web";\n',
      'import { ProviderGalleryImage } from "@beautonomi/ui/web";\n' + hookImport,
    );
    s = s.replace(
      "const PartnerPhotos: React.FC<PartnerPhotosProps> = ({ gallery = [], businessName, slug }) => {",
      "const PartnerPhotos: React.FC<PartnerPhotosProps> = ({ gallery = [], businessName, slug }) => {\n  const { pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    ['<h2 className="text-2xl font-semibold mb-6">Photos</h2>', "<h2 className=\"text-2xl font-semibold mb-6\">{pp(\"tabPhotos\")}</h2>"],
    ['title="No photos available"', "title={pp(\"noPhotosAvailable\")}"],
    [
      'description="This provider hasn\'t added any photos yet"',
      "description={pp(\"noPhotosHint\")}",
    ],
    ["See all images", "{pp(\"seeAllImages\")}"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-team.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import EmptyState from "@/components/ui/empty-state";\n',
      'import EmptyState from "@/components/ui/empty-state";\n' + hookImport,
    );
    s = s.replace(
      "  const [error, setError] = useState<string | null>(null);",
      "  const [error, setError] = useState<string | null>(null);\n  const { pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    [': "Failed to load team members";', ": pp(\"failedLoadTeam\");"],
    ['<LoadingTimeout loadingMessage="Loading team..." />', "<LoadingTimeout loadingMessage={pp(\"loadingTeam\")} />"],
    ['title="Failed to load team"', "title={pp(\"failedLoadTeam\")}"],
    ['<h2 className="text-2xl font-semibold mb-6">Team</h2>', "<h2 className=\"text-2xl font-semibold mb-6\">{pp(\"tabTeam\")}</h2>"],
    ['title="No team members"', "title={pp(\"noTeamMembers\")}"],
    [
      'description="This provider hasn\'t added team members yet."',
      "description={pp(\"noTeamHint\")}",
    ],
    ['{member.role || "Staff"}', "{member.role || pp(\"staffFallback\")}"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-products.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import { useTranslation } from "@beautonomi/i18n";\n',
      'import { useTranslation } from "@beautonomi/i18n";\n' + hookImport,
    );
    s = s.replace(
      "  const { t } = useTranslation();",
      "  const { t } = useTranslation();\n  const { pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    ['<LoadingTimeout loadingMessage="Loading shop..." />', "<LoadingTimeout loadingMessage={pp(\"loadingShop\")} />"],
    ["No products available yet", "{pp(\"noProductsYet\")}"],
    [">\n        Shop\n      </h2>", ">\n        {pp(\"tabShop\")}\n      </h2>"],
    ['aria-label="Scroll categories left"', 'aria-label={t("web.a11y.scrollLeft")}'],
    ['aria-label="Scroll categories right"', 'aria-label={t("web.a11y.scrollRight")}'],
    ["No products in this category.", "{pp(\"noProductsInCategory\")}"],
    ["Out of stock", "{pp(\"outOfStock\")}"],
    ['{p.hasVariants ? "From " : ""}', "{p.hasVariants ? pp(\"fromPrefix\") : \"\"}"],
    ['aria-label="Product list pagination"', "aria-label={pp(\"productPaginationA11y\")}"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  // translate All/Other pills
  if (!s.includes("label === \"All\"")) {
    s = s.replace(
      "                >\n                  {label}\n                </button>",
      "                >\n                  {label === \"All\" ? pp(\"filterAll\") : label === \"Other\" ? pp(\"filterOther\") : label}\n                </button>",
    );
  }
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-memberships.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import { useTranslation } from "@beautonomi/i18n";\n',
      'import { useTranslation } from "@beautonomi/i18n";\n' + hookImport,
    );
    s = s.replace(
      "  const { t } = useTranslation();",
      "  const { t } = useTranslation();\n  const { pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    ['toast.success(tender === "wallet" ? "Membership paid from your wallet." : "Membership activated.");', "toast.success(tender === \"wallet\" ? pp(\"membershipPaidWallet\") : pp(\"membershipActivated\"));"],
    [': "Failed to start membership purchase");', ": pp(\"failedMembershipPurchase\"));"],
    ['<h2 className="text-2xl font-semibold mb-6">Memberships</h2>', "<h2 className=\"text-2xl font-semibold mb-6\">{pp(\"tabMemberships\")}</h2>"],
    ['<LoadingTimeout loadingMessage="Loading memberships..." />', "<LoadingTimeout loadingMessage={pp(\"loadingMemberships\")} />"],
    ['title="No memberships available"', "title={pp(\"noMembershipsAvailable\")}"],
    [
      'description="This provider doesn\'t offer any membership plans at this time"',
      "description={pp(\"noMembershipsHint\")}",
    ],
    ["{safeDiscountPct(p.discount_percent)}% off services", "{pp(\"percentOffServices\", { percent: safeDiscountPct(p.discount_percent) })}"],
    ['? "Paused — manage in account"', "? pp(\"subscribedPaused\")"],
    [': "✓ Active — auto-renews monthly"', ": pp(\"activeAutoRenews\")"],
    ['? "Checking account..."', "? pp(\"checkingAccount\")"],
    ['? "Redirecting..."', "? pp(\"redirecting\")"],
    ['? "Paused — manage in account"', "? pp(\"subscribedPaused\")"],
    [': "Your current plan"', ": pp(\"yourCurrentPlan\")"],
    [': "Subscribe"', ": pp(\"subscribeCta\")"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  s = s.replace(
    /Pay with wallet \(\{walletCurrency\} \{safeMoney\(walletBalance\)\}\)/,
    "{pp(\"payWithWalletCta\")} ({walletCurrency} {safeMoney(walletBalance)})",
  );
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/service-detail-modal.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import { Clock, MapPin, Check } from "lucide-react";\n',
      'import { Clock, MapPin, Check } from "lucide-react";\n' + hookImport,
    );
    s = s.replace(
      "  const pageParams = useSearchParams();",
      "  const { t, pp } = usePartnerProfileT();\n  const pageParams = useSearchParams();",
    );
  }
  const reps = [
    ["About this service", "{pp(\"aboutThisService\")}"],
    ["No description available for this service.", "{pp(\"noDescriptionForService\")}"],
    ["Options", "{pp(\"optionsHeading\")}"],
    [
      "This service is offered in multiple options. Choose one when you book — each may differ in time and price.",
      "{pp(\"optionsMultiHint\")}",
    ],
    ["{v.duration_minutes} min", "{pp(\"durationMinutes\", { minutes: v.duration_minutes })}"],
    ["Service details", "{pp(\"serviceDetails\")}"],
    ["Duration: {service.duration}", "{pp(\"durationLabel\", { duration: service.duration })}"],
    ["From / base price: {service.price}", "{pp(\"fromBasePrice\", { price: service.price })}"],
    ['Available:{" "}', "{pp(\"availableLabel\")}:{\" \"}"],
    ['&& "At Salon"', "&& pp(\"atSalon\")"],
    ['&& "At Home"', "&& pp(\"atYourHome\")"],
    ["What&apos;s included", "{pp(\"whatsIncluded\")}"],
    ["Book this service", "{pp(\"bookThisService\")}"],
    [">\n            Close\n          </Button>", ">\n            {t(\"web.a11y.close\")}\n          </Button>"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/components/partner-buy.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("usePartnerProfileT")) {
    s = s.replace(
      'import { toast } from "sonner";\n',
      'import { toast } from "sonner";\n' + hookImport,
    );
    s = s.replace(
      "  const router = useRouter();",
      "  const router = useRouter();\n  const { pp } = usePartnerProfileT();",
    );
  }
  const reps = [
    ['toast.success("Purchase started. Check your Payments & Gift Cards.");', "toast.success(pp(\"purchaseStarted\"));"],
    [': "Failed to start gift card purchase");', ": pp(\"failedGiftCardPurchase\"));"],
    ['<h2 className="text-2xl font-semibold mb-6">Gift Cards</h2>', "<h2 className=\"text-2xl font-semibold mb-6\">{pp(\"giftCardsHeading\")}</h2>"],
    ["Treat yourself or a friend", "{pp(\"giftCardsTreat\")}"],
    [
      "Purchase a gift card for future visits to this provider. Gift cards can be used for any service or booking.",
      "{pp(\"giftCardsBody\")}",
    ],
    ['{isLoading ? "Redirecting..." : "Buy Gift Card"}', "{isLoading ? pp(\"redirecting\") : pp(\"buyGiftCardCta\")}"],
    ["Need a custom service?", "{pp(\"giftCardsNeedCustom\")}"],
    ['"Request Custom Service"', "{pp(\"tabCustomService\")}"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/partner-profile/page.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  const reps = [
    ["Provider not found", "{t(\"customer.mobile.screens.partnerProfile.providerNotFound\")}"],
    ["Please provide a provider slug.", "{t(\"customer.mobile.screens.partnerProfile.pleaseProvideSlug\")}"],
    [">Go Home</a>", ">{t(\"customer.mobile.screens.partnerProfile.goHome\")}</a>"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  // page already has getServerT in generateMetadata; the default export needs t too
  if (!s.includes("const t = await getServerT") || s.split("getServerT").length < 3) {
    s = s.replace(
      "  if (!slug) {\n    return (",
      "  const ctx = await resolveRequestLanguage();\n  const t = await getServerT(ctx.language);\n\n  if (!slug) {\n    return (",
    );
  }
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/search/search-page-client.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import type { Category } from "@/types/beautonomi";\n',
      'import type { Category } from "@/types/beautonomi";\nimport { useTranslation } from "@beautonomi/i18n";\n',
    );
    s = s.replace(
      "}) {\n  return (",
      "}) {\n  const { t } = useTranslation();\n  return (",
    );
  }
  s = s.split("Loading search…").join("{t(\"web.search.loading\")}");
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/search/components/search-results.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  if (!s.includes("translatePublicCategory")) {
    s = s.replace(
      'import { SearchQueryBarWithSuggestions } from "./search-query-bar";\n',
      'import { SearchQueryBarWithSuggestions } from "./search-query-bar";\nimport { translatePublicCategory } from "@/lib/i18n/translate-public-category";\n',
    );
  }
  s = s.replace(
    "const PRICE_RANGE_OPTIONS = [\n  { label: \"Any\", value: \"\" },\n  { label: \"Under R100\", value: \"under-100\" },\n  { label: \"R100-R500\", value: \"100-500\" },\n  { label: \"R500+\", value: \"500-plus\" },\n] as const;",
    "function priceRangeOptions(t: (key: string) => string) {\n  return [\n    { label: t(\"web.search.filters.any\"), value: \"\" },\n    { label: t(\"web.search.filters.under100\"), value: \"under-100\" },\n    { label: t(\"web.search.filters.range100to500\"), value: \"100-500\" },\n    { label: t(\"web.search.filters.plus500\"), value: \"500-plus\" },\n  ] as const;\n}",
  );
  s = s.replace(
    "const SEARCH_FILTER_GROUPS = [\n  {\n    label: \"Category\",\n    key: \"category\",\n    options: [] as { label: string; value: string }[],\n  },\n  {\n    label: \"Price Range\",\n    key: \"price_range\",\n    options: PRICE_RANGE_OPTIONS.map((option) => ({ ...option })),\n  },\n  {\n    label: \"Rating\",\n    key: \"rating_min\",\n    options: [\n      { label: \"Any\", value: \"\" },\n      { label: \"4+ Stars\", value: \"4\" },\n      { label: \"3+ Stars\", value: \"3\" },\n    ],\n  },\n];",
    "function searchFilterGroups(t: (key: string) => string) {\n  return [\n    {\n      label: t(\"web.search.filters.category\"),\n      key: \"category\",\n      options: [] as { label: string; value: string }[],\n    },\n    {\n      label: t(\"web.search.filters.priceRange\"),\n      key: \"price_range\",\n      options: priceRangeOptions(t).map((option) => ({ ...option })),\n    },\n    {\n      label: t(\"web.search.filters.rating\"),\n      key: \"rating_min\",\n      options: [\n        { label: t(\"web.search.filters.any\"), value: \"\" },\n        { label: t(\"web.search.filters.stars4\"), value: \"4\" },\n        { label: t(\"web.search.filters.stars3\"), value: \"3\" },\n      ],\n    },\n  ];\n}",
  );
  s = s.replace(
    "    const options = [{ label: \"All\", value: \"\" }];\n    categories.forEach((cat) => {\n      options.push({ label: cat.name, value: cat.slug });\n    });",
    "    const options = [{ label: t(\"web.search.filters.all\"), value: \"\" }];\n    categories.forEach((cat) => {\n      options.push({ label: translatePublicCategory(t, cat.slug, cat.name), value: cat.slug });\n    });",
  );
  s = s.replace(
    "      SEARCH_FILTER_GROUPS.map((group) =>",
    "      searchFilterGroups(t).map((group) =>",
  );
  if (!s.includes("categoryFilterOptions, t]")) {
    s = s.replace(
      "    [categoryFilterOptions],",
      "    [categoryFilterOptions, t],",
    );
  }
  const reps = [
    ['? "Request timed out. Please try again."', "? t(\"web.search.timedOut\")"],
    [': "Failed to search providers";', ": t(\"web.search.failedProviders\");"],
    ['<LoadingTimeout loadingMessage="Searching providers..." />', "<LoadingTimeout loadingMessage={t(\"web.search.searching\")} />"],
    ['<option value="relevance">Relevance</option>', "<option value=\"relevance\">{t(\"web.search.sort.relevance\")}</option>"],
    ['<option value="price_low">Price: Low to High</option>', "<option value=\"price_low\">{t(\"web.search.sort.priceLow\")}</option>"],
    ['<option value="price_high">Price: High to Low</option>', "<option value=\"price_high\">{t(\"web.search.sort.priceHigh\")}</option>"],
    ['<option value="rating">Rating</option>', "<option value=\"rating\">{t(\"web.search.sort.rating\")}</option>"],
    ['<option value="soonest">Soonest Available</option>', "<option value=\"soonest\">{t(\"web.search.sort.soonest\")}</option>"],
    [
      '{results.total} {results.total === 1 ? "provider" : "providers"} found',
      "{results.total === 1 ? t(\"web.search.providersFound_one\", { count: results.total }) : t(\"web.search.providersFound_other\", { count: results.total })}",
    ],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/search/components/search-query-bar.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  const reps = [
    [
      '{s.type === "service" ? "Service" : s.type === "provider" ? "Provider" : "Category"}',
      '{s.type === "service" ? t("web.search.suggestion.service") : s.type === "provider" ? t("web.search.suggestion.provider") : t("web.search.suggestion.category")}',
    ],
    [
      '{s.distance_km < 1 ? "< 1 km away" : `${s.distance_km.toFixed(1)} km away`}',
      "{s.distance_km < 1 ? t(\"web.search.distanceUnder1km\") : t(\"web.search.distanceAway\", { km: s.distance_km.toFixed(1) })}",
    ],
    [">\n        Search\n      </Button>", ">\n        {t(\"web.search.searchCta\")}\n      </Button>"],
  ];
  for (const [from, to] of reps) s = s.split(from).join(to);
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

{
  const p = "apps/web/src/app/login/page.tsx";
  let s = fs.readFileSync(path.join(root, p), "utf8");
  s = s.replace(
    "function friendlyAuthErrorMessage(raw: string, channel: \"phone\" | \"email\"): string {",
    "function friendlyAuthErrorMessage(raw: string, channel: \"phone\" | \"email\", t: (key: string) => string): string {",
  );
  s = s.replace(
    '    return "Too many attempts. Please wait a moment before trying again.";',
    '    return t("web.login.errors.tooManyAttempts");',
  );
  s = s.replace(
    '  if (lower.includes("invalid phone")) return "That phone number doesn\'t look right. Double-check the country code.";',
    '  if (lower.includes("invalid phone")) return t("web.login.errors.invalidPhone");',
  );
  s = s.replace(
    '  if (lower.includes("invalid email")) return "That email address doesn\'t look right.";',
    '  if (lower.includes("invalid email")) return t("web.login.errors.invalidEmail");',
  );
  s = s.replace(
    `    return channel === "phone"
      ? "Phone sign-ups are currently disabled. Try email or social sign-in."
      : "Email sign-ups are currently disabled. Try phone or social sign-in.";`,
    `    return channel === "phone"
      ? t("web.login.errors.phoneSignupDisabled")
      : t("web.login.errors.emailSignupDisabled");`,
  );
  s = s.replace(
    '    return "We couldn\'t find an account. New here? Verify the code to create one.";',
    '    return t("web.login.errors.userNotFound");',
  );
  s = s.replace(
    '    return "That code has expired. Request a new one and try again.";',
    '    return t("web.login.errors.codeExpired");',
  );
  s = s.replace(
    '    return "That code doesn\'t match. Check the digits and try again.";',
    '    return t("web.login.errors.codeInvalid");',
  );
  s = s.replaceAll(
    "friendlyAuthErrorMessage(msg, \"phone\")",
    "friendlyAuthErrorMessage(msg, \"phone\", t)",
  );
  s = s.replaceAll(
    "friendlyAuthErrorMessage(raw, \"phone\")",
    "friendlyAuthErrorMessage(raw, \"phone\", t)",
  );
  s = s.replaceAll(
    "friendlyAuthErrorMessage(msg, \"email\")",
    "friendlyAuthErrorMessage(msg, \"email\", t)",
  );
  s = s.replaceAll(
    "friendlyAuthErrorMessage(raw, \"email\")",
    "friendlyAuthErrorMessage(raw, \"email\", t)",
  );
  const reps = [
    [": \"Failed to send OTP\";", ": t(\"web.login.errors.failedSendOtp\");"],
    [": \"Invalid code\";", ": t(\"web.login.errors.invalidCode\");"],
    ['const msg = "Please enter your email";', "const msg = t(\"web.login.errors.enterEmail\");"],
    ['const msg = "Please enter a valid email address";', "const msg = t(\"web.login.errors.validEmail\");"],
    [": \"Failed to send email code\";", ": t(\"web.login.errors.failedSendEmail\");"],
    [": \"Failed to resend code\";", ": t(\"web.login.errors.failedResend\");"],
    ['setFormError("Please enter your email");', "setFormError(t(\"web.login.errors.enterEmail\"));"],
    ['setFormError("Please enter your password");', "setFormError(t(\"web.login.errors.enterPassword\"));"],
    [
      '`Sign in with ${provider === "google" ? "Google" : "Apple"} failed.`',
      "t(provider === \"google\" ? \"web.login.errors.googleFailed\" : \"web.login.errors.appleFailed\")",
    ],
    ['aria-label="Beautonomi home"', 'aria-label={t("web.a11y.beautonomiHome")}'],
    ["Welcome back", "{t(\"web.login.welcomeBack\")}"],
    [
      "Sign in or create an account — we&apos;ll set you up when you verify.",
      "{t(\"web.login.signInOrCreate\")}",
    ],
    [
      "Continue with phone, email{hasSocialAuth ? \", Google, or Apple\" : \", or password\"}.",
      "{hasSocialAuth ? t(\"web.login.continueWithChannelsSocial\") : t(\"web.login.continueWithChannels\")}",
    ],
    ["No password? Sign in with an email code instead →", "{t(\"web.login.noPasswordUseEmailCode\")}"],
    ['aria-label="Sign-in method"', 'aria-label={t("web.global.loginModal.signInMethodAriaLabel")}'],
    [">\n              Phone\n            </button>", ">\n              {t(\"web.global.loginModal.phone\")}\n            </button>"],
    [
      "Phone and email sign-in are currently unavailable.",
      "{t(\"web.login.phoneEmailUnavailable\")}",
    ],
    ['{hasSocialAuth ? " Use Google or Apple below." : " Please try again later or contact support."}', "{hasSocialAuth ? t(\"web.login.useSocialBelow\") : t(\"web.login.tryLater\")}"],
    ["Sending code…", "{t(\"web.global.loginModal.sendingCode\")}"],
    ['                "Continue"', "                t(\"web.global.loginModal.continue\")"],
    ['aria-label="Back to phone number"', 'aria-label={t("web.login.backToPhone")}'],
    ['label="Phone verification code"', "label={t(\"web.global.loginModal.phoneVerificationCodeLabel\")}"],
    ["Code expires in{\" \"}", "{t(\"web.global.loginModal.codeExpiresIn\")}{\" \"}"],
    ["Code expired — request a new one.", "{t(\"web.login.codeExpiredBanner\")}"],
    ['? "Resending…"', "? t(\"web.global.loginModal.resending\")"],
    [": \"Resend code\"}", ": t(\"web.global.loginModal.resendCode\")}"],
    ['                "Send code"', "                t(\"web.global.loginModal.sendCode\")"],
    ['aria-label="Back to email"', 'aria-label={t("web.login.backToEmail")}'],
    ['label="Email verification code"', "label={t(\"web.global.loginModal.emailVerificationCodeLabel\")}"],
    ['placeholder="Your password"', "placeholder={t(\"web.login.passwordPlaceholder\")}"],
    ['aria-label={showPassword ? "Hide password" : "Show password"}', "aria-label={showPassword ? t(\"web.global.loginModal.hidePassword\") : t(\"web.global.loginModal.showPassword\")}"],
  ];
  for (const [from, to] of reps) {
    if (s.includes(from)) s = s.split(from).join(to);
    else console.warn("login skip", JSON.stringify(from).slice(0, 70));
  }
  fs.writeFileSync(path.join(root, p), s);
  console.log("patched", p);
}

console.log("file patch done");

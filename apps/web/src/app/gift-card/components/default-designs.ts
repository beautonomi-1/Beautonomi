export interface GiftCardDesign {
  id: number;
  slug: string;
  src: string;
  alt: string;
  title: string;
  tagline: string;
}

/**
 * On-brand fallback gift-card artwork shipped with the app. Used whenever the
 * gift-card CMS has not been configured yet so the marketing page always feels
 * complete and premium instead of showing empty placeholders.
 */
// Slugs match the canonical marketplace template ids (gc-birthday, gc-thankyou, …)
// so that clicking a design on the marketing page pre-selects the correct card
// on the purchase page via ?template_id=<slug>.
export const DEFAULT_GIFT_CARD_DESIGNS: GiftCardDesign[] = [
  {
    id: 1,
    slug: "gc-birthday",
    src: "/images/gift-cards/birthday.svg",
    alt: "Beautonomi birthday gift card",
    title: "Happy Birthday",
    tagline: "Make their day glow",
  },
  {
    id: 2,
    slug: "gc-thankyou",
    src: "/images/gift-cards/thankyou.svg",
    alt: "Beautonomi thank you gift card",
    title: "Thank You",
    tagline: "Say it beautifully",
  },
  {
    id: 3,
    slug: "gc-selfcare",
    src: "/images/gift-cards/selfcare.svg",
    alt: "Beautonomi self-care gift card",
    title: "Self-Care Day",
    tagline: "A moment to unwind",
  },
  {
    id: 4,
    slug: "gc-holiday",
    src: "/images/gift-cards/holiday.svg",
    alt: "Beautonomi holiday gift card",
    title: "Holiday Special",
    tagline: "Celebrate the season",
  },
  {
    id: 5,
    slug: "gc-custom",
    src: "/images/gift-cards/custom.svg",
    alt: "Beautonomi custom amount gift card",
    title: "Any Occasion",
    tagline: "Your amount, their choice",
  },
];

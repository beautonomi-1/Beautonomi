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
export const DEFAULT_GIFT_CARD_DESIGNS: GiftCardDesign[] = [
  {
    id: 1,
    slug: "birthday",
    src: "/images/gift-cards/birthday.svg",
    alt: "Beautonomi birthday gift card",
    title: "Happy Birthday",
    tagline: "Make their day glow",
  },
  {
    id: 2,
    slug: "thankyou",
    src: "/images/gift-cards/thankyou.svg",
    alt: "Beautonomi thank you gift card",
    title: "Thank You",
    tagline: "Say it beautifully",
  },
  {
    id: 3,
    slug: "selfcare",
    src: "/images/gift-cards/selfcare.svg",
    alt: "Beautonomi self-care gift card",
    title: "Self-Care Day",
    tagline: "A moment to unwind",
  },
  {
    id: 4,
    slug: "holiday",
    src: "/images/gift-cards/holiday.svg",
    alt: "Beautonomi holiday gift card",
    title: "Holiday Special",
    tagline: "Celebrate the season",
  },
  {
    id: 5,
    slug: "custom",
    src: "/images/gift-cards/custom.svg",
    alt: "Beautonomi custom amount gift card",
    title: "Any Occasion",
    tagline: "Your amount, their choice",
  },
];

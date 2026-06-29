"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { fetcher } from "@/lib/http/fetcher";

interface FAQProps {
  applyBgPrimary?: boolean;
  category?: string;
  limit?: number;
  /** Use partner-focused CMS category + curated fallback when API returns nothing. */
  partnerPage?: boolean;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  isList?: boolean;
}

// Default FAQs as fallback (general / homepage)
const defaultFaqData: FAQItem[] = [
  {
    id: "item-1",
    question: "How do I signup as a beauty partner on Beautonomi?",
    answer: "1. Go to the Beautonomi website and find the 'Join as a Beauty Professional' link. 2. Fill out the registration form with your name, contact information, and expertise. 3. Upload any required certifications or licences. 4. Wait for approval — the Beautonomi team reviews your application and notifies you once approved. After approval, you can start offering services through the platform.",
    isList: true,
  },
  {
    id: "item-2",
    question: "How does booking work for services on Beautonomi?",
    answer: "1. Browse services and choose the beauty professional you want. 2. Select a date and time that suits your schedule. 3. Confirm your booking and review the details. 4. Receive a confirmation notification with your appointment details and reminders. On the day, simply enjoy your service.",
    isList: true,
  },
  {
    id: "item-3",
    question: "What measures are in place for safety and reliability?",
    answer: "All beauty professionals are thoroughly vetted before joining the platform. Compliance with health and safety standards is required. Customers can leave reviews and ratings after appointments. Payment transactions are processed securely. Dedicated customer support is available for any issues.",
  },
  {
    id: "item-4",
    question: "How and when do I receive payments for my services?",
    answer: "Payments are processed on a regular schedule (typically weekly). Funds are transferred to your designated bank account or payout method. You receive a notification when payments are processed. Platform fees and commissions are shown clearly in your dashboard.",
  },
  {
    id: "item-5",
    question: "Can I get a custom offer on Beautonomi?",
    answer: "Yes. You can request custom offers through the platform — contact our support team or use the messaging feature to discuss custom pricing and packages with service providers.",
  },
];

// Gift-card-specific FAQ fallback shown on /gift-card when the database returns nothing
const giftCardDefaultFaqData: FAQItem[] = [
  {
    id: "gc-1",
    question: "How do I buy a Beautonomi gift card?",
    answer: "Click 'Buy now' or pick a design on this page, then choose your amount and complete checkout with Paystack. Your gift card code arrives by email immediately after payment is confirmed.",
  },
  {
    id: "gc-2",
    question: "How does the recipient receive the gift card?",
    answer: "If you enter a recipient email at checkout, we send the gift card code to that address with instructions to redeem. If the recipient already has a Beautonomi account, the card also appears automatically in their account under Payments & gift cards. If you leave the email blank, the code goes to you and you can share it however you like.",
  },
  {
    id: "gc-3",
    question: "How do I redeem a gift card?",
    answer: "At booking checkout, choose 'Gift card' as your payment method and enter the code. The gift card balance is applied to the total. Any remaining balance stays on the card for a future booking. You can also redeem a card to your Beautonomi wallet from Account settings → Payments.",
  },
  {
    id: "gc-4",
    question: "Do Beautonomi gift cards expire?",
    answer: "No. Gift card credit does not expire, so you can use it whenever you are ready to book a beauty or wellness service.",
  },
  {
    id: "gc-5",
    question: "Can I check my gift card balance?",
    answer: "Yes. Sign in and go to Account settings → Payments & gift cards. Your active cards and current balances are listed there.",
  },
  {
    id: "gc-6",
    question: "Can a gift card be used across different providers and services?",
    answer: "Yes. Beautonomi gift cards are platform-wide and can be used with any provider or service available on the platform.",
  },
  {
    id: "gc-7",
    question: "What happens if I lose my gift card code?",
    answer: "Your code is saved to your account under Payments & gift cards, so signing in is all you need to find it. If you did not create an account, contact our support team with your purchase confirmation email and we can help recover your code.",
  },
  {
    id: "gc-8",
    question: "Can I buy gift cards in bulk for my business?",
    answer: "Yes. On the purchase page, switch to 'Bulk purchase' to order up to 1000 cards in a single transaction. For very large orders or custom arrangements, contact our sales team.",
  },
];

const becomePartnerDefaultFaqData: FAQItem[] = [
  {
    id: "partner-1",
    question: "How do I join Beautonomi as a provider?",
    answer:
      "Create a provider account and complete onboarding: business profile, services, availability, and payout details. Once verified, clients can book you through the marketplace.",
  },
  {
    id: "partner-2",
    question: "How do payouts and fees work?",
    answer:
      "You receive payouts according to your region and payout settings in the provider portal. Platform fees and settlement timing are shown in your dashboard and agreement—there are no hidden per-booking surprises in the product UI.",
  },
  {
    id: "partner-3",
    question: "Can I offer house calls and salon appointments?",
    answer:
      "Yes. You can configure house calls, salon locations, or both depending on your business. Travel fees and coverage are set per your rules and tenant configuration.",
  },
  {
    id: "partner-4",
    question: "How do clients book and pay?",
    answer:
      "Clients book through your public profile or the marketplace. Payments are processed securely; you see booking status, deposits, and paid amounts in your calendar and bookings list.",
  },
];

/** Detect explicit numbered list ("1. Foo 2. Bar…") only — no heuristic guessing. */
function hasNumberedList(answer: string): boolean {
  return /\d+\.\s+\S/.test(answer);
}

function getFallbackFaqs(category: string | undefined, partnerPage: boolean): FAQItem[] {
  if (category === "gift-card") return giftCardDefaultFaqData;
  if (partnerPage) return becomePartnerDefaultFaqData;
  return defaultFaqData;
}

export default function FAQ({ applyBgPrimary, category, limit, partnerPage }: FAQProps) {
  const [faqData, setFaqData] = useState<FAQItem[]>(() => getFallbackFaqs(category, !!partnerPage));
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFAQs = async () => {
      try {
        setIsLoading(true);
        let url = "/api/public/faqs";
        const params = new URLSearchParams();
        const effectiveCategory = category ?? (partnerPage ? "become-partner" : undefined);
        if (effectiveCategory) params.append("category", effectiveCategory);
        if (limit) params.append("limit", limit.toString());
        if (params.toString()) url += `?${params.toString()}`;

        const response = await fetcher.get<{
          data: Array<{
            id: string;
            question: string;
            answer: string;
            category?: string;
          }>;
          error: null | { message: string; code: string };
        }>(url);

        if (response.data && response.data.length > 0) {
          const transformed = response.data.map((faq) => ({
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            isList: hasNumberedList(faq.answer),
          }));
          setFaqData(transformed);
        } else {
          setFaqData(getFallbackFaqs(category, !!partnerPage));
        }
      } catch (error) {
        console.error("Error fetching FAQs:", error);
        setFaqData(getFallbackFaqs(category, !!partnerPage));
      } finally {
        setIsLoading(false);
      }
    };

    fetchFAQs();
  }, [category, limit, partnerPage]);
  const onPrimary = !!applyBgPrimary;
  const headingClass = onPrimary
    ? "text-white md:mb-4 max-w-72 md:max-w-md text-[26px] md:text-4xl lg:text-[40px] font-normal lg:font-semibold"
    : "md:mb-4 max-w-72 md:max-w-md text-[26px] md:text-4xl lg:text-[40px] font-normal lg:font-semibold";
  const triggerClass = onPrimary
    ? "text-lg md:text-[22px] font-light text-white hover:text-white/90 text-left [&[data-state=open]]:text-white"
    : "text-lg md:text-[22px] font-light text-secondary text-left";
  const contentClass = onPrimary ? "font-light text-white/95" : "font-light";
  const listClass = onPrimary ? "list-decimal ml-6 text-white/95" : "list-decimal ml-6";
  const paragraphClass = onPrimary
    ? "text-base font-light text-white/95"
    : "text-base font-light text-destructive";

  return (
    <div className={applyBgPrimary ? "bg-primary py-16" : ""}>
      <div className="container">
        <div className="block lg:grid grid-cols-12">
          <div className="col-span-5">
            <h2 className={headingClass}>
              Your questions, answered
            </h2>
          </div>
          <div className="col-span-7">
            <Accordion type="single" collapsible>
              {faqData.map((faq) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className={onPrimary ? "mb-3 border-b border-white/30" : "mb-3"}
                >
                  <AccordionTrigger className={triggerClass}>
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className={contentClass}>
                    {faq.isList ? (
                      <ol className={listClass}>
                        {faq.answer
                          .split(/\s*\d+\.\s+/)
                          .map((item) => item.trim())
                          .filter((item) => item.length > 0)
                          .map((item, index) => (
                            <li key={index} className="mb-2">
                              {item}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className={paragraphClass}>{faq.answer}</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  );
}

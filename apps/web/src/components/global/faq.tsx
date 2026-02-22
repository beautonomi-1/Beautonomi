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
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  isList?: boolean;
}

// Default FAQs as fallback
const defaultFaqData: FAQItem[] = [
  {
    id: "item-1",
    question: "How do I signup as a beauty partner on Beautonomi?",
    answer: "Go to the official Beautonomi website. Navigate to the Partner Signup Page: Look for the 'Join as a Beauty Professional' link. Fill Out the Registration Form: Provide the required details such as your name, contact information, and expertise. Submit Necessary Documents: Upload any required certifications or licenses, if applicable. Wait for Approval: The Beautonomi team will review your application and notify you once approved. After approval, you can start offering your beauty services through the platform!",
    isList: true,
  },
  {
    id: "item-2",
    question: "How Does the booking work for services on Beautonomi?",
    answer: "Browse Services: Choose the service you want from available beauty professionals. Select a Date and Time: Pick a convenient time slot that suits your schedule. Confirm Your Booking: Review the details and confirm your appointment. Receive Confirmation: You'll get a notification with booking details and reminders. On the appointment day, simply enjoy your service!",
    isList: true,
  },
  {
    id: "item-3",
    question: "What measures are in place for safety and reliability of beauty professionals and customers?",
    answer: "All beauty professionals are thoroughly vetted. Compliance with health and safety standards is required. Customers can leave reviews and ratings. Payment transactions are processed securely. Dedicated customer support is available for any issues.",
  },
  {
    id: "item-4",
    question: "How and when do I receive payments for the services I provide?",
    answer: "Payments are processed on a regular schedule, typically weekly or monthly. Funds are transferred to your designated bank account or payment method. You'll receive a notification when payments are processed. Be aware of any service fees or commissions that might apply.",
  },
  {
    id: "item-5",
    question: "Can I get a custom offer on Beautonomi?",
    answer: "Yes, you can request custom offers through the platform. Contact our support team or use the messaging feature to discuss custom pricing and packages with service providers.",
  },
];

export default function FAQ({ applyBgPrimary, category, limit }: FAQProps) {
  const [faqData, setFaqData] = useState<FAQItem[]>(defaultFaqData);
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFAQs = async () => {
      try {
        setIsLoading(true);
        let url = "/api/public/faqs";
        const params = new URLSearchParams();
        if (category) params.append("category", category);
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
          // Transform database FAQs to component format
          const transformed = response.data.map((faq) => {
            // Detect if answer should be a list
            // Check for patterns like "1. ", "Step 1:", or multiple sentences starting with capital letters
            const sentences = faq.answer.split(/\.(?=\s+[A-Z])/).filter(s => s.trim());
            const hasNumberedPattern = /^\d+\.\s+[A-Z]/.test(faq.answer.trim()) || 
                                      /^[A-Z][^.]*:/.test(faq.answer.trim()) ||
                                      sentences.length > 3;
            
            return {
              id: faq.id,
              question: faq.question,
              answer: faq.answer,
              category: faq.category,
              isList: hasNumberedPattern,
            };
          });
          setFaqData(transformed);
        } else {
          // Use default FAQs if no data from API
          setFaqData(defaultFaqData);
        }
      } catch (error) {
        console.error("Error fetching FAQs:", error);
        // Use default FAQs on error
        setFaqData(defaultFaqData);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFAQs();
  }, [category, limit]);
  return (
    <div className={applyBgPrimary ? "bg-primary py-16" : ""}>
      <div className="container">
        <div className="block lg:grid grid-cols-12">
          <div className="col-span-5">
            <h2 className="md:mb-4 max-w-72 md:max-w-md text-[26px] md:text-4xl lg:text-[40px] font-normal lg:font-semibold">
              Your questions, answered
            </h2>
          </div>
          <div className="col-span-7">
            <Accordion type="single" collapsible>
              {faqData.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} className="mb-3">
                  <AccordionTrigger className="text-lg md:text-[22px] font-light text-secondary text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="font-light">
                    {faq.isList ? (
                      <ol className="list-decimal ml-6">
                        {faq.answer
                          .split(/(?=\d+\.\s+[A-Z])|(?=[A-Z][^.]*:)|(?=\.\s+[A-Z])/)
                          .filter(item => item.trim() && item.trim().length > 10)
                          .map((item, index) => {
                            const trimmed = item.trim();
                            // Remove leading numbers and colons if present
                            const cleaned = trimmed.replace(/^\d+\.\s*/, '').replace(/^[A-Z][^:]*:\s*/, '');
                            return (
                              <li key={index} className="mb-2">
                                {cleaned}
                                {!cleaned.endsWith('.') && !cleaned.endsWith('!') && '.'}
                              </li>
                            );
                          })}
                      </ol>
                    ) : (
                      <p className="text-base font-light text-destructive">{faq.answer}</p>
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

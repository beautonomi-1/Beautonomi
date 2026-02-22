'use client'
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { MoveUp } from "lucide-react";

export default function TermsOfService() {
  const terms = [
    {
      title: "Booking and Cancellation",
      content: "Appointments can be booked through our website, mobile app, or by phone. We require 24-hour notice for cancellations. Late cancellations or no-shows may result in a cancellation fee."
    },
    {
      title: "Payment",
      content: "Payment is due at the time of service. We accept cash, credit cards, and approved digital payment methods. Prices are subject to change without notice."
    },
    {
      title: "Gift Cards and Promotions",
      content: "Gift cards purchased from us are non-refundable and can only be used for services or products offered at our salon. Promotions and discounts cannot be combined with other offers unless otherwise specified."
    },
    {
      title: "Health and Safety",
      content: "Your health and safety are our top priorities. Please inform our staff of any allergies, skin sensitivities, or health conditions before receiving services. We reserve the right to refuse service if we believe it may pose a risk to your health or the safety of our staff."
    },
    {
      title: "Privacy and Confidentiality",
      content: "We are committed to protecting your personal information. Your details are only used to provide services and improve your experience. Please review our Privacy Policy for more information on how your data is handled."
    },
    {
      title: "Refunds and Returns",
      content: "All sales of products and services are final. If you are dissatisfied with a product or service, please contact us within 7 days, and we will do our best to address the issue."
    },
    {
      title: "Salon Etiquette",
      content: "We strive to create a relaxing and welcoming environment. Please arrive on time for your appointment and silence your mobile devices to maintain a peaceful atmosphere for all guests."
    },
    {
      title: "Liability Waiver",
      content: "By using our services, you acknowledge and agree that [Beauty Salon Name] will not be held responsible for any injury, loss, or damage arising from your visit or use of our services unless caused by our negligence."
    },
    {
      title: "Changes to Terms",
      content: "We reserve the right to update or modify these Terms at any time without prior notice. Continued use of our services after changes are made constitutes acceptance of the new Terms."
    },
  ];

  const [showScroll, setShowScroll] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 200) {
        setShowScroll(true);
      } else {
        setShowScroll(false);
      }
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Function to scroll to the top
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="container mx-auto px-4 my-8">
      <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Applicability of Terms</h2>
              <p className="mb-4">
                These Terms of Service govern your use of our beauty and salon services. By booking or using our services, you agree to these terms.
              </p>
              <p className="mb-4">
                If you are located in the United States, the Terms of Service for US Customers apply to you.
              </p>
              <p>
                If you are located outside the United States, the Terms of Service for International Customers apply to you.
              </p>
            </div>
          </div>
          
          <section className="space-y-4">
            {terms.map((term, index) => (
              <div key={index}>
                <h3 className="text-xl font-semibold mt-6">{index + 1}. {term.title}</h3>
                <p>{term.content.replace(/'/g, "&apos;")}</p>
              </div>
            ))}
          </section>
        </div>
        <div className="space-y-6">
          <div>
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Need to get in touch?</h2>
              <p className="mb-4">We&apos;re here to help with any questions about our terms of service.</p>
              <Button className="w-full">Contact Us</Button>
            </div>
          </div>
        </div>
      </div>

      {showScroll && (
        <Button
          onClick={scrollToTop}
          variant="default"
          className="fixed bottom-8 right-8 transition duration-300"
        >
            <MoveUp className="h-5"/>
          Back to Top
        </Button>
      )}
    </div>
  );
}

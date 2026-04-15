"use client";
import LoginModal from "@/components/global/login-modal";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import type { HelpPageContent } from "../page";

function sectionText(content: HelpPageContent | null | undefined, key: string) {
  return content?.[key]?.content?.trim() ?? "";
}

interface CTAProps {
  content?: HelpPageContent | null;
}

export default function CTA({ content = null }: CTAProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuth();

  const handleLoginClick = () => {
    setIsModalOpen(true);
  };

  const heading = sectionText(content, "cta_heading") || "We're here for you";
  const bodyGuest =
    sectionText(content, "cta_body_guest") ||
    "You need to log in to submit or view your support tickets. We can help with your bookings, account, and more.";
  const bodyAuthed =
    sectionText(content, "cta_body_authenticated") ||
    "Can't find what you're looking for? Submit a support ticket and we'll help you out.";
  const mobileHintGuest =
    sectionText(content, "cta_mobile_hint_guest") ||
    "Log in to submit or view your support tickets.";

  return (
    <div className="max-w-6xl mx-auto mb-7 px-0 sm:px-1">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-32 items-center justify-between p-0 lg:p-6 border-none lg:border rounded-lg mx-auto">
        <div className={user ? "hidden lg:block" : ""}>
          <h2 className="text-[26px] font-normal ">{heading}</h2>
          <p className="text-base font-normal ">
            {user ? bodyAuthed : bodyGuest}
          </p>
        </div>
        {user ? (
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Link href="/help/submit-ticket" className="flex-1">
              <Button variant="secondary" className="w-full">
                Submit a Support Ticket
              </Button>
            </Link>
            <Link href="/help/my-tickets" className="flex-1">
              <Button variant="outline" className="w-full">
                My tickets
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3 w-full">
            <p className="text-sm text-zinc-600 lg:hidden">{mobileHintGuest}</p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleLoginClick}
            >
              Log in or sign up
            </Button>
          </div>
        )}
      </div>
      <LoginModal
        open={isModalOpen}
        setOpen={setIsModalOpen}
        initialMode="login"
      />
    </div>
  );
}

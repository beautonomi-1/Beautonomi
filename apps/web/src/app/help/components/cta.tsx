"use client";
import LoginModal from "@/components/global/login-modal";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";

export default function CTA() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuth();

  const handleLoginClick = () => {
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto mb-7">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-32 items-center justify-between p-0 lg:p-6 border-none lg:border rounded-lg  mx-auto">
        <div className="hidden lg:block">
          <h2 className="text-[26px] font-normal ">We&apos;re here for you</h2>
          <p className="text-base font-normal ">
            {user 
              ? "Can&apos;t find what you&apos;re looking for? Submit a support ticket and we&apos;ll help you out."
              : "Log in to get help with your reservations, account, and more."}
          </p>
        </div>
        {user ? (
          <Link href="/help/submit-ticket" className="w-full">
            <Button variant="secondary" className="w-full">
              Submit a Support Ticket
            </Button>
          </Link>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleLoginClick}
          >
            Log in or sign up
          </Button>
        )}
      </div>
      <LoginModal open={isModalOpen} setOpen={setIsModalOpen} />
    </div>
  );
}

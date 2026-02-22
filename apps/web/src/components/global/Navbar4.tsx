import React from "react";
import { Button } from "../ui/button";
import Link from "next/link";

const Navbar4 = () => {
  return (
    <div className="sticky top-0 z-10 bg-white">
    <div className="container">
      <div className="flex justify-between items-center py-3 mb-20">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-xl font-bold" style={{ color: "#FF0077" }}>Beautonomi</span>
      </Link>
        <div className="hidden md:flex items-center gap-5">
          <Link href="/account-settings/payments" className="text-secondary text-base font-normal underline">
            Redeem
          </Link>
          <Link href="/gift-card/purchase">
            <Button variant="secondary" size="rounded">
              Buy now
            </Button>
          </Link>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white p-4 shadow-lg flex items-center justify-between z-10">
        <Link href="/account-settings/payments" className="text-secondary text-base font-normal underline">
          Redeem
        </Link>
        <Link href="/gift-card/purchase">
          <Button variant="secondary" size="rounded">
            Buy now
          </Button>
        </Link>
      </div>
    </div>
    </div>
  );
};

export default Navbar4;

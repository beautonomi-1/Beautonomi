"use client";
import { MoveUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/button";
import GooglePlayStore from './../../../public/images/playstore-svgrepo-com.svg'
import Apple from './../../../public/images/apple-173-svgrepo-com.svg'
import PlatformLogo from "../platform/PlatformLogo";

export default function Footer1() {
  return (
    <footer className="bg-primary py-8">
      <div className="max-w-[2340px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div>
            <Link href="/">
            <PlatformLogo alt="Beautonomi Logo" className="mb-4 w-44" />
            </Link>
            <div className="space-y-2">
              <Button className="bg-white text-black text-xs justify-start" size="lg">
                <Image
                  src={GooglePlayStore}
                  alt="Google Play Store"
                  className="h-6 w-6 mr-2"
                />
                Download from Google Play
              </Button>
              <Button className="bg-white text-black text-xs  justify-start px-9" size="lg">
                <Image
                  src={Apple}
                  alt="Apple App Store"
                  className="h-6 w-6 mr-2"
                />
                  Download from App Store 
              </Button>
            </div>
          </div>
          
          {[
            {
              title: "About Beautonomi",
              links: [
                { href: "/career", text: "Careers" },
                { href: "/", text: "Customer Support" },
                { href: "/", text: "Blog" },
              ],
            },
            {
              title: "For business",
              links: [
                { href: "/BCover-for-partners", text: "For Partners" },
                { href: "/", text: "Pricing" },
                { href: "/", text: "Support" },
              ],
            },
            {
              title: "Legal",
              links: [
                { href: "/privacy-policy", text: "Privacy Policy" },
                { href: "/terms-and-condition", text: "Terms of Service" },
                { href: "/", text: "Terms of use" },
              ],
            },
            {
              title: "Find us on social",
              links: [
                { href: "https://facebook.com", text: "Facebook" },
                { href: "https://twitter.com", text: "Twitter" },
                { href: "https://linkedin.com", text: "LinkedIn" },
                { href: "https://instagram.com", text: "Instagram" },
              ],
            },
          ].map((section, index) => (
            <div key={index}>
              <h3 className="font-semibold mb-4 text-sm">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href={link.href}
                      className="text-gray-600 hover:text-gray-900 text-sm flex items-center font-light"
                    >
                      {section.title === "Find us on social" && <MoveUpRight size={14} className="mr-1" />}
                      {link.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-gray-500 text-xs font-light">
            <p className="m-0">&copy; 2024 Beautonomi. All rights reserved.</p>
            <span className="text-gray-400">·</span>
            <Link href="/sitemap.xml" className="hover:text-gray-700 hover:underline">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import PlatformLogo from "../platform/PlatformLogo";
import { fetcher } from "@/lib/http/fetcher";

interface AboutUsContent {
  section_key: string;
  title: string;
  content: string;
}

interface AboutUsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutUsModal({ isOpen, onClose }: AboutUsModalProps) {
  const [content, setContent] = useState<AboutUsContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadContent();
    }
  }, [isOpen]);

  const loadContent = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: AboutUsContent[]; error: null }>("/api/public/about-us");
      setContent(response.data || []);
    } catch (error) {
      console.error("Failed to load about us content:", error);
      // Fallback to empty array if API fails
      setContent([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Group content by section type
  const mainSections = content.filter(
    (item) =>
      !item.section_key.startsWith("contact_") || item.section_key === "contact_intro"
  );
  const contactItems = content.filter(
    (item) => item.section_key.startsWith("contact_") && item.section_key !== "contact_intro"
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[9999] rounded-none sm:rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-semibold flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
            <PlatformLogo alt="Beautonomi Logo" className="w-24 sm:w-32" />
            <span>About Beautonomi</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-4 sm:space-y-6 py-2 sm:py-4">
            {mainSections.map((section) => (
              <div key={section.section_key}>
                <h3 className="text-base sm:text-lg font-semibold mb-2">{section.title}</h3>
                <p className="text-sm sm:text-base text-gray-600">{section.content}</p>
              </div>
            ))}

            {contactItems.length > 0 && (
              <div>
                {content.find((item) => item.section_key === "contact_intro") && (
                  <>
                    <h3 className="text-base sm:text-lg font-semibold mb-2">
                      {content.find((item) => item.section_key === "contact_intro")?.title || "Contact Us"}
                    </h3>
                    <p className="text-sm sm:text-base text-gray-600 mb-2">
                      {content.find((item) => item.section_key === "contact_intro")?.content}
                    </p>
                  </>
                )}
                <ul className="list-disc list-inside text-gray-600 mt-2 space-y-1">
                  {contactItems.map((item) => {
                    const isHelpCenter = item.section_key === "contact_help_center";
                    return (
                      <li key={item.section_key}>
                        {item.title}:{" "}
                        {isHelpCenter ? (
                          <a href="/help" className="text-[#FF0077] hover:underline">
                            {item.content}
                          </a>
                        ) : (
                          item.content
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {content.length === 0 && !isLoading && (
              <div className="py-8 text-center text-gray-500">
                No content available at the moment.
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 text-center">
                © {new Date().getFullYear()} Beautonomi. All rights reserved.
              </p>
            </div>
          </div>
        )}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} className="bg-[#FF0077] hover:bg-[#E6006A] text-white">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

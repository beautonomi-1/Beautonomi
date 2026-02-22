"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import CustomerTab from "./guestTab";
import ProviderTab from "./hostTab";
import ExperienceHost from "./experienceHostTab";
import BusinessAdmin from "./businessAdminTab";
import CTA from "@/app/help/components/cta";

const tabs = [
  { value: "step1", label: "Customer", hash: "customer" },
  { value: "step2", label: "Provider", hash: "provider" },
  { value: "step3", label: "Experience Provider", hash: "experience-provider" },
  { value: "step4", label: "Business Admin", hash: "business-admin" },
];

const TabComponent = () => {
  // Determine initial tab from hash
  const getInitialTab = () => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const tab = tabs.find(t => t.hash === hash);
        if (tab) return tab.value;
      }
    }
    return "step1";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Update tab when hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const tab = tabs.find(t => t.hash === hash);
        if (tab) {
          setActiveTab(tab.value);
          // Scroll to tabs section
          setTimeout(() => {
            const tabsElement = document.querySelector('[role="tablist"]');
            if (tabsElement) {
              tabsElement.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }, 100);
        }
      }
    };

    // Check hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <div className="mb-4 md:mb-8">
      <div className="container">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="text-center max-w-6xl mx-auto mb-14">
            <TabsList className="flex gap-5 border-b">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`py-2 px-4 ${
                    activeTab === tab.value
                      ? "border-b-2 border-black text-black text-sm"
                      : "border-b-2 border-transparent text-sm font-light text-destructive"
                  }`}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <CTA />

          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
            >
              {tab.value === "step1" ? <CustomerTab /> : null}
              {tab.value === "step2" ? <ProviderTab /> : null}
              {tab.value === "step3" ? <ExperienceHost /> : null}
              {tab.value === "step4" ? <BusinessAdmin /> : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default TabComponent;

"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import RoleOverview from "./role-overview";
import Application from "./application";

const tabs = [
  { value: "step1", label: "Role Overview" },
  { value: "step2", label: "Application" },
];

const AccountantTab = () => {
  const [activeTab, setActiveTab] = useState("step1");

  return (
    <div className="mb-4 md:mb-8">
      <div className="container">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="text-center  mb-14 px-5">
            <TabsList className="flex gap-5 border-b">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`py-2 px-4 ${
                    activeTab === tab.value
                      ? "border-b-2 border-black text-black"
                      : "text-sm font-normal text-destructive"
                  }`}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
            >
              {tab.value === "step1" ? <RoleOverview /> : null}
              {tab.value === "step2" ? <Application /> : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default AccountantTab;

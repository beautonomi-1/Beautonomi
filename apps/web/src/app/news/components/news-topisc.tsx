"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import Company from "../tabs/company";
import Stays from "../tabs/stays";
import Product from "../tabs/product";
import Policy from "../tabs/policy";
import Community from "../tabs/community";

const tabs = [
  { value: "step1", label: "Company" },
  { value: "step2", label: "Stays" },
  { value: "step3", label: " Product" },
  { value: "step4", label: "Policy" },
  { value: "step5", label: "Community" },
];

const NewsTopics = () => {
  const [activeTab, setActiveTab] = useState("step1");

  return (
    <div className="mb-8">
      <div className="container">
           <h2 className='text-[26px] lg:text-[40px] font-normal  text-secondary mb-5'> News by topic </h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="text-center max-w-6xl  mb-12">
            <TabsList className="flex flex-wrap gap-5">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`py-2 px-4 ${
                    activeTab === tab.value
                      ? "border rounded-3xl border-black text-black bg-[#f7f7f7]"
                      : "border rounded-3xl border-destructive text-sm font-light text-destructive"
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
              {tab.value === "step1" ? <Company /> : null}
              {tab.value === "step2" ? <Stays /> : null}
              {tab.value === "step3" ? <Product /> : null}
              {tab.value === "step4" ? <Policy /> : null}
              {tab.value === "step5" ? <Community /> : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default NewsTopics;
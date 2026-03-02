"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import Company from "../tabs/company";
import Providers from "../tabs/providers";
import Product from "../tabs/product";

const tabs = [
  { value: "step1", label: "Company" },
  { value: "step2", label: "Providers" },
  { value: "step3", label: "Product" },
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
              {tab.value === "step2" ? <Providers /> : null}
              {tab.value === "step3" ? <Product /> : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default NewsTopics;
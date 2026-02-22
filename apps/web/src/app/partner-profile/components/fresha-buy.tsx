"use client";
import React from "react";

const PartnerBuy: React.FC = () => {
  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Buy</h2>
      
      <div className="border border-gray-200 rounded-lg p-6 max-w-md">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Gift Cards</h3>
          <p className="text-gray-600 text-sm">
            Treat yourself or a friend to future visits.
          </p>
        </div>
        <button className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium">
          Buy
        </button>
      </div>
    </div>
  );
};

export default PartnerBuy;

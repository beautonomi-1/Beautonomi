"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/providers/AuthProvider";
import LoginModal from "@/components/global/login-modal";
import { useState } from "react";

const ExploreFeed = dynamic(
  () => import("@/components/explore/ExploreFeed").then((m) => ({ default: m.ExploreFeed })),
  { ssr: true, loading: () => <div className="h-32 animate-pulse rounded-lg bg-gray-100" /> }
);

export default function ExploreSavedPage() {
  const { user, isLoading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      queueMicrotask(() => setShowLogin(true));
    }
  }, [user, isLoading]);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Saved</h1>
      {user ? (
        <ExploreFeed saved />
      ) : (
        <div className="py-16 text-center">
          <p className="text-gray-600 mb-4">Sign in to view your saved posts.</p>
          <button
            onClick={() => setShowLogin(true)}
            className="px-6 py-2 bg-[#FF0077] text-white rounded-lg font-medium hover:bg-[#D60565] transition-colors"
          >
            Sign in
          </button>
        </div>
      )}
      <LoginModal open={showLogin} setOpen={setShowLogin} />
    </div>
  );
}

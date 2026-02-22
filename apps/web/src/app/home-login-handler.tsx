"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import LoginModal from "@/components/global/login-modal";
import { useAuth } from "@/providers/AuthProvider";

export default function HomeLoginHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const [redirectContext, setRedirectContext] = useState<"provider" | "customer" | undefined>(undefined);

  useEffect(() => {
    const shouldOpenLogin = searchParams.get("login") === "true";
    const redirect = searchParams.get("redirect");
    if (!shouldOpenLogin) return;
    queueMicrotask(() => {
      setIsLoginModalOpen(true);
      if (redirect) {
        setRedirectPath(redirect);
        if (redirect.startsWith("/provider")) {
          setRedirectContext("provider");
        } else {
          setRedirectContext("customer");
        }
      }
    });
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete("login");
    newUrl.searchParams.delete("redirect");
    router.replace(newUrl.pathname + newUrl.search, { scroll: false });
  }, [searchParams, router]);

  // After successful login, redirect to the intended path
  useEffect(() => {
    if (user && redirectPath) {
      // Small delay to ensure auth state is fully updated
      const timer = setTimeout(() => {
        router.push(redirectPath);
        setRedirectPath(null);
        setIsLoginModalOpen(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, redirectPath, router]);

  return (
    <LoginModal 
      open={isLoginModalOpen} 
      setOpen={setIsLoginModalOpen}
      redirectContext={redirectContext}
    />
  );
}

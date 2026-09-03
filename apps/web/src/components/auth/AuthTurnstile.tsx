"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => string;
    };
  }
}

export function AuthTurnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile || !ref.current) return;
      window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken });
    };

    if (window.turnstile) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-bn-turnstile="1"]');
    if (existing) {
      existing.addEventListener("load", render);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.dataset.bnTurnstile = "1";
    script.onload = render;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} className="my-3 flex justify-center" data-testid="auth-turnstile" />;
}

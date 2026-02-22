"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";

/**
 * FaviconSpinner Component
 * 
 * Detects Fast Refresh events and authentication loading, showing a spinning favicon wheel.
 * This provides visual feedback during development hot reloads and auth checks.
 */
export default function FaviconSpinner() {
  const { isLoading: authLoading } = useAuth();
  const { branding } = usePlatformSettings();
  const [isFastRefreshRebuilding, setIsFastRefreshRebuilding] = useState(false);
  const shouldShowSpinner = authLoading || isFastRefreshRebuilding;
  
  const animationFrameIdRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Set up console interceptors once (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    const checkFastRefresh = (message: string) => {
      if (message.includes("[Fast Refresh] rebuilding")) {
        setIsFastRefreshRebuilding(true);
      }
      if (message.includes("[Fast Refresh] done")) {
        setTimeout(() => {
          setIsFastRefreshRebuilding(false);
        }, 300);
      }
    };
    
    console.log = function(...args: any[]) {
      const message = args.join(" ");
      if (message.includes("[Fast Refresh]")) {
        checkFastRefresh(message);
      }
      originalLog.apply(console, args);
    };
    
    console.warn = function(...args: any[]) {
      const message = args.join(" ");
      if (message.includes("[Fast Refresh]")) {
        checkFastRefresh(message);
      }
      originalWarn.apply(console, args);
    };
    
    console.error = function(...args: any[]) {
      const message = args.join(" ");
      if (message.includes("[Fast Refresh]")) {
        checkFastRefresh(message);
      }
      originalError.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  // Set up canvas once
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvasRef.current = canvas;
      ctxRef.current = ctx;
    }
  }, []);

  // Animation effect
  useEffect(() => {
    if (!ctxRef.current || !canvasRef.current) return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    // Function to draw spinning wheel on favicon
    const drawSpinner = () => {
      const centerX = 16;
      const centerY = 16;
      const radius = 14;
      const time = Date.now() / 50;
      
      ctx.clearRect(0, 0, 32, 32);
      
      // Draw background circle with gradient using platform colors
      const primaryColor = branding?.primary_color || "#FF0077";
      const secondaryColor = branding?.secondary_color || "#D60565";
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(1, secondaryColor);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw spinning segments
      const segments = 12;
      const segmentAngle = (Math.PI * 2) / segments;
      
      for (let i = 0; i < segments; i++) {
        const angle = (i * segmentAngle) + rotationRef.current;
        const wave = Math.sin(angle * 2 + time * 0.1);
        const opacity = 0.4 + (wave + 1) / 2 * 0.6;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        const x = -1.5;
        const y = -11;
        const w = 3;
        const h = 4;
        const r = 1.5;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      
      rotationRef.current += 0.15;
      if (rotationRef.current > Math.PI * 2) {
        rotationRef.current -= Math.PI * 2;
      }
    };

    // Function to update favicon
    const updateFavicon = () => {
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      
      if (shouldShowSpinner) {
        drawSpinner();
        const dataUrl = canvas.toDataURL("image/png");
        
        if (link) {
          link.href = dataUrl;
        } else {
          const newLink = document.createElement("link");
          newLink.rel = "icon";
          newLink.href = dataUrl;
          document.head.appendChild(newLink);
        }
      } else {
        // Don't restore favicon here - let DynamicBranding handle it
        // This prevents conflicts and ensures the platform favicon is used
      }
    };

    // Animation loop
    const animate = () => {
      if (shouldShowSpinner) {
        updateFavicon();
        animationFrameIdRef.current = requestAnimationFrame(animate);
      } else {
        updateFavicon();
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
      }
    };

    // Start or stop animation based on shouldShowSpinner
    if (shouldShowSpinner) {
      animate();
    } else {
      updateFavicon();
    }

    // Cleanup
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      // Don't restore favicon on cleanup - let DynamicBranding handle it
      // This ensures the platform favicon is properly restored
    };
  }, [shouldShowSpinner, branding]);

  return null;
}

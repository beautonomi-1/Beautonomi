"use client";

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import logo from './../../public/images/logo-beatonomi.svg';
import BeautonomiHeader from "@/components/layout/beautonomi-header";

const Footer = dynamic(
  () => import('@/components/layout/footer').then((m) => ({ default: m.default })),
  { ssr: true }
);
const BottomNav = dynamic(
  () => import('@/components/layout/bottom-nav').then((m) => ({ default: m.default })),
  { ssr: true }
);

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string; status?: number };
  reset: () => void;
}) {
  const router = useRouter();
  const { user, role, isLoading } = useAuth();

  // Check if error is 403 or 404 and user is a provider
  useEffect(() => {
    if (!isLoading && user && role) {
      const isProvider = role === 'provider_owner' || role === 'provider_staff' || role === 'superadmin';
      const is403Or404 = error.status === 403 || error.status === 404 || 
                         error.message?.includes('403') || 
                         error.message?.includes('404') ||
                         error.message?.includes('Forbidden') ||
                         error.message?.includes('Not Found');

      if (isProvider && is403Or404) {
        // Redirect providers to provider portal
        router.replace('/provider/dashboard');
        return;
      }
    }
  }, [error, user, role, isLoading, router]);

  // Show loading while checking auth (prevents flash of customer page for providers)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF007F] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is a provider and error is 403/404, show minimal loading while redirect happens
  if (user && role && (role === 'provider_owner' || role === 'provider_staff' || role === 'superadmin')) {
    const is403Or404 = error.status === 403 || error.status === 404 || 
                       error.message?.includes('403') || 
                       error.message?.includes('404') ||
                       error.message?.includes('Forbidden') ||
                       error.message?.includes('Not Found');
    
    if (is403Or404) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF007F] mx-auto mb-4"></div>
            <p className="text-gray-600">Redirecting to provider portal...</p>
          </div>
        </div>
      );
    }
  }

  // Check if user is a provider
  const isProvider = user && role && (role === 'provider_owner' || role === 'provider_staff' || role === 'superadmin');

  // Provider error page
  if (isProvider) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <Image src={logo} alt="Logo" className="w-24 h-24 mx-auto mb-6" />
          
          <h2 className="text-4xl font-bold mb-2 text-gray-900">
            {error.status === 403 ? '403' : error.status === 404 ? '404' : 'Error'}
          </h2>
          <h3 className="text-xl font-semibold mb-4 text-gray-700">
            {error.status === 403 ? 'Access Forbidden' : error.status === 404 ? 'Page Not Found' : 'Something went wrong'}
          </h3>
          <p className="text-gray-600 mb-6 text-sm">
            {error.message || 'An unexpected error occurred'}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button 
              variant="default" 
              onClick={() => router.push('/provider/dashboard')}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              Back to Provider Portal
            </Button>
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Customer error page
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader/>
      <div className="flex flex-col pt-16 pb-20 items-center justify-center bg-primary">
        <Image src={logo} alt="Logo" className="w-32 h-32 mb-6" />
        
        <h2 className="text-7xl font-bold mb-4">
          {error.status === 403 ? '403' : error.status === 404 ? '404' : 'Error'}
        </h2>
        <h2 className="text-3xl font-bold mb-4">
          {error.status === 403 ? 'Access Forbidden' : error.status === 404 ? 'Page Not Found' : 'Something went wrong'}
        </h2>
        <p className="text-gray-600 mb-6 max-w-md text-center">
          {error.message || 'An unexpected error occurred'}
        </p>
        
        <div className="flex gap-4">
          <Button variant="secondary" onClick={() => router.push('/')}>
            Back to site
          </Button>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
      <Footer/>
      <BottomNav />
    </div>
  );
}

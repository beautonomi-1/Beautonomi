"use client";

import Link from 'next/link';
import Image from 'next/image'
import { Button } from '@/components/ui/button';
import logo from './../../public/images/logo-beatonomi.svg'
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from '@/components/layout/footer';
import BottomNav from '@/components/layout/bottom-nav';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const Custom404 = () => {
  const { user, role, isLoading } = useAuth();
  const router = useRouter();

  // Redirect providers to provider portal automatically
  useEffect(() => {
    if (!isLoading && user && role) {
      // Check if user is a provider
      if (role === 'provider_owner' || role === 'provider_staff' || role === 'superadmin') {
        // Redirect to provider dashboard
        router.replace('/provider/dashboard');
        return;
      }
    }
  }, [user, role, isLoading, router]);

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

  // If user is a provider, show minimal loading while redirect happens
  if (user && role && (role === 'provider_owner' || role === 'provider_staff' || role === 'superadmin')) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF007F] mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to provider portal...</p>
        </div>
      </div>
    );
  }

  // Customer 404 page
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader/>
      <div className="flex flex-col pt-16 pb-20 items-center justify-center bg-primary">
        <Image src={logo} alt="Logo" className="w-32 h-32 mb-6" />
        
        <h2 className="text-7xl font-bold mb-4">404</h2>
        <h2 className="text-3xl font-bold mb-4">Page Not Found</h2>
        
        <Link href="/">
         <Button variant="secondary">Back to site</Button>
        </Link>
      </div>
      <Footer/>
      <BottomNav />
    </div>
  );
}

export default Custom404;

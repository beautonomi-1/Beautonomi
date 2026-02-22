"use client";
import React, { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import RentalPhotos from './rental-photos'
import ActionToolbar from './action-toolbar'
import Footer from '@/components/layout/footer'
import LoadingTimeout from '@/components/ui/loading-timeout'
import EmptyState from '@/components/ui/empty-state'
import { fetcher, FetchError, FetchTimeoutError } from '@/lib/http/fetcher'
import type { PublicProviderDetail } from '@/types/beautonomi'

const GalleryContent = () => {
  const searchParams = useSearchParams()
  const [provider, setProvider] = useState<PublicProviderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentSlug, setCurrentSlug] = useState<string | null>(null)

  useEffect(() => {
    const loadProvider = async () => {
      // Get slug from URL params - try multiple parameter names
      const slugParam = searchParams.get("slug") || 
                       searchParams.get("partnerId") || 
                       searchParams.get("providerSlug")
      const slug = slugParam ? decodeURIComponent(slugParam) : null

      // Use stored slug if URL params are missing (for page refreshes)
      let finalSlug = slug || currentSlug

      // Also try to get slug from the current URL path if not in query params
      if (!finalSlug && typeof window !== 'undefined') {
        // Try to extract from referrer or previous navigation
        const referrer = document.referrer
        if (referrer) {
          try {
            const referrerUrl = new URL(referrer)
            const referrerSlug = referrerUrl.searchParams.get("slug")
            if (referrerSlug) {
              finalSlug = decodeURIComponent(referrerSlug)
            }
          } catch {
            // Ignore URL parsing errors
          }
        }
      }

      if (!finalSlug) {
        setError("Provider slug is required. Please navigate from the provider profile page.")
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        const response = await fetcher.get<{
          data: PublicProviderDetail
          error: null
        }>(`/api/public/providers/${encodeURIComponent(finalSlug)}`, {
          timeoutMs: 15000,
        })
        setProvider(response.data)
        // Store the slug for future use
        if (response.data.slug) {
          setCurrentSlug(response.data.slug)
          // Update URL if slug is missing from query params
          if (!slug && typeof window !== 'undefined') {
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.set('slug', response.data.slug)
            window.history.replaceState({}, '', newUrl.toString())
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load provider"
        setError(errorMessage)
        console.error("Error loading provider:", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadProvider()
  }, [searchParams])

  if (isLoading) {
    return (
      <div>
        <ActionToolbar />
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading gallery..." />
        </div>
        <Footer />
      </div>
    )
  }

  if (error || !provider) {
    return (
      <div>
        <ActionToolbar />
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Gallery unavailable"
            description={error || "Unable to load gallery images"}
          />
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div>
      <Suspense fallback={<div className="sticky top-0 z-10 bg-white py-6"><div className="container"><div className="flex justify-between items-center"><div>Loading...</div></div></div></div>}>
        <ActionToolbar />
      </Suspense>
      <RentalPhotos 
        gallery={provider.gallery || []} 
        businessName={provider.business_name}
        slug={provider.slug}
      />
      <Footer />
    </div>
  )
}

const page = () => {
  return (
    <Suspense fallback={
      <div>
        <ActionToolbar />
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading gallery..." />
        </div>
        <Footer />
      </div>
    }>
      <GalleryContent />
    </Suspense>
  )
}

export default page

"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import Overlay from "ol/Overlay";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Icon, Text, Fill, Stroke, Circle as CircleStyle } from "ol/style";
import { EssentialsButtons } from "@/app/category/components/amenties";
import { X, Map as MapIcon, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import CarouselCard from "@/app/home/components/carousel-card";
import { useSearchParams } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";
import type { PublicProviderCard, SearchResult } from "@/types/beautonomi";
import LoadingTimeout from "@/components/ui/loading-timeout";

// Import the location marker image
import type { StaticImageData } from "next/image";
import locationMarker from "../../../../public/images/map-marker.svg";

function toMarkerSrc(src: string | StaticImageData): string {
  return typeof src === "string" ? src : src.src;
}

interface Listing {
  id: string;
  lat: number;
  lng: number;
  price: number;
  slides: Array<{ src: string; alt: string }>;
  content: Record<string, string>;
  alwaysShowMarker: boolean;
  provider: PublicProviderCard;
}

// Helper function to convert provider data to listing format
const createListingsFromProviders = (providers: PublicProviderCard[], userLat?: number, userLng?: number): Listing[] => {
  return providers.map((provider) => {
    // Use provider distance_km to estimate location, or default to London
    // Note: The API doesn't return lat/lng in PublicProviderCard, so we'll use a default
    // In a real implementation, you'd want to fetch location data separately or include it in the API response
    const lat = 51.5074 + (Math.random() - 0.5) * 0.1; // Random location near London for now
    const lng = -0.1278 + (Math.random() - 0.5) * 0.1;
    
    // Calculate distance if user location is provided
    let distance: string | undefined;
    if (userLat && userLng) {
      const distanceKm = calculateDistance(userLat, userLng, lat, lng);
      distance = distanceKm < 1 
        ? `${Math.round(distanceKm * 1000)}m away`
        : `${distanceKm.toFixed(1)}km away`;
    } else if (provider.distance_km) {
      distance = provider.distance_km < 1
        ? `${Math.round(provider.distance_km * 1000)}m away`
        : `${provider.distance_km.toFixed(1)}km away`;
    }

    // Create slides from provider thumbnail (PublicProviderCard doesn't have gallery_images)
    const slides = provider.thumbnail_url
      ? [{ src: provider.thumbnail_url, alt: `${provider.business_name} thumbnail` }]
      : [{ src: "/images/placeholder-provider.jpg", alt: "Provider image" }];

    return {
      id: provider.id,
      lat,
      lng,
      price: provider.starting_price || 0,
      slides,
      content: {
        title: provider.business_name || "Provider",
        subtitle: distance || provider.city || "",
        dates: provider.business_type || "",
        amountstatus: provider.starting_price 
          ? `${provider.currency || "£"}${provider.starting_price}+`
          : "Price on request",
        ratings: provider.rating?.toFixed(1) || "0.0",
        ratingsVisible: provider.review_count && provider.review_count > 0 ? "true" : "false",
        guestfav: provider.is_featured ? "true" : "false",
        iconType: "share",
        // Note: PublicProviderCard doesn't have location_type, so we'll default to both
        atsalon: "true",
        housecall: "true",
      },
      alwaysShowMarker: provider.is_featured || false,
      provider,
    };
  });
};

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ZOOM_THRESHOLD = 14;

export default function Places() {
  const searchParams = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState(["wifi", "kitchen"]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [popupPosition, setPopupPosition] = useState<[number, number] | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const vectorLayerRef = useRef<any>(null);

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Silently fail if geolocation is denied
        }
      );
    }
  }, []);

  // Fetch providers from API
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Build query string from search params
        const queryParams = new URLSearchParams();
        searchParams.forEach((value, key) => {
          queryParams.append(key, value);
        });

        // Add location params if available
        if (userLocation) {
          queryParams.set("lat", userLocation.lat.toString());
          queryParams.set("lng", userLocation.lng.toString());
        }

        const response = await fetcher.get<{
          data: SearchResult;
          error: null;
        }>(`/api/public/search?${queryParams.toString()}`);

        if (response.data && response.data.providers) {
          const providerListings = createListingsFromProviders(
            response.data.providers,
            userLocation?.lat,
            userLocation?.lng
          );
          setListings(providerListings);
        } else {
          setListings([]);
        }
      } catch (err) {
        console.error("Error fetching providers:", err);
        setError("Failed to load providers. Please try again.");
        setListings([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProviders();
  }, [searchParams, userLocation]);

  useEffect(() => {
    if (isLoading || listings.length === 0) return;

    // Determine initial map center
    const initialCenter = userLocation
      ? [userLocation.lng, userLocation.lat]
      : listings.length > 0
      ? [listings[0].lng, listings[0].lat]
      : [-0.1278, 51.5074]; // Default to London

    const map = new Map({
      target: "map",
      layers: [
        new TileLayer({
          source: new OSM(),
          className: 'map-tiles'
        }),
      ],
      view: new View({
        center: fromLonLat(initialCenter as [number, number]),
        zoom: userLocation ? 12 : 13,
      }),
    });

    const overlay = new Overlay({
      element: document.getElementById("popup") || undefined,
      positioning: "bottom-center",
      stopEvent: false,
    });

    map.addOverlay(overlay);

    const vectorSource = new VectorSource();
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      zIndex: 1  // Ensure vector layer is above the tile layer
    });

    map.addLayer(vectorLayer);

    const createMarkerStyles = (listing: Listing, resolution: number, isHovered: boolean = false) => {
      const zoom = map.getView().getZoom() || 0;
      const scale = isHovered ? 1 : 1;
      
      if (zoom >= ZOOM_THRESHOLD || listing.alwaysShowMarker) {
        return new Style({
          image: new Icon({
            anchor: [0.5, 1],
            anchorXUnits: "fraction",
            anchorYUnits: "fraction",
            src: toMarkerSrc(locationMarker),
            scale: scale * 0.5,
          }),
          text: new Text({
            text: listing.content.ratings,
            font: 'bold 10px Arial',
            fill: new Fill({ color: '#ffffff' }),
            stroke: new Stroke({ color: '#000000', width: 2 }),
            offsetY: -20,
          })
        });
      } else {
        return new Style({
          image: new CircleStyle({
            radius: 6 * scale,
            fill: new Fill({ color: '#000000' }),
            stroke: new Stroke({ color: '#ffffff', width: 2 })
          })
        });
      }
    };

    listings.forEach((listing) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([listing.lng, listing.lat])),
        listing: listing,
      });

      feature.setStyle((feature, resolution) => createMarkerStyles(listing, resolution));

      vectorSource.addFeature(feature);
    });

    const handleMapClick = (event: any) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (feature) => feature);
      if (feature) {
        const listing = (feature.get("listing") as Listing);
        setSelectedListing(listing);
        setPopupPosition([listing.lat, listing.lng]);
        overlay.setPosition(fromLonLat([listing.lng, listing.lat]));
        
        map.getView().animate({
          center: fromLonLat([listing.lng, listing.lat]),
          zoom: 16,
          duration: 500,
        });
      } else {
        setSelectedListing(null);
        setPopupPosition(null);
        overlay.setPosition(undefined);
      }
    };

    let hoveredFeature: any = null;

    const handlePointerMove = (event: any) => {
      const pixel = map.getEventPixel(event.originalEvent);
      const hit = map.hasFeatureAtPixel(pixel);
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';

      if (hoveredFeature && hoveredFeature instanceof Feature) {
        const listing = hoveredFeature.get('listing') as Listing;
        hoveredFeature.setStyle((feature, resolution) => createMarkerStyles(listing, resolution));
        hoveredFeature = null;
      }

      map.forEachFeatureAtPixel(pixel, (feature) => {
        if (feature instanceof Feature) {
          hoveredFeature = feature;
          const listing = feature.get('listing') as Listing;
          feature.setStyle((feature, resolution) => createMarkerStyles(listing, resolution, true));
        }
      }, {
        hitTolerance: 5
      });
    };

    const handleMoveEnd = () => {
      const _zoom = map.getView().getZoom() || 0;
      vectorSource.getFeatures().forEach((feature) => {
        const listing = feature.get('listing') as Listing;
        feature.setStyle((feature, resolution) => createMarkerStyles(listing, resolution));
      });
    };

    map.on("click", handleMapClick);
    map.on("pointermove", handlePointerMove);
    map.on("moveend", handleMoveEnd);

    mapRef.current = map;
    overlayRef.current = overlay;
    vectorLayerRef.current = vectorLayer;

    // Add CSS for the white fade effect
    const style = document.createElement('style');
    style.textContent = `
      .map-tiles {
        filter: opacity(0.7);
      }
    `;
    document.head.appendChild(style);

    return () => {
      map.setTarget(undefined);
      map.un("click", handleMapClick);
      map.un("pointermove", handlePointerMove);
      map.un("moveend", handleMoveEnd);
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, [listings, isLoading, userLocation]);

  const toggleOption = (option: string) => {
    setSelectedOptions((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  };

  const handleListingClick = useCallback((listing: Listing) => {
    setSelectedListing(listing);
    setPopupPosition([listing.lat, listing.lng]);
    if (mapRef.current && overlayRef.current) {
      mapRef.current.getView().animate({
        center: fromLonLat([listing.lng, listing.lat]),
        zoom: 16,
        duration: 500,
      });
      overlayRef.current.setPosition(fromLonLat([listing.lng, listing.lat]));
    }
    // If on mobile, switch to map view when a listing is clicked
    if (window.innerWidth < 1024) {
      setShowMap(true);
    }
  }, []);

  const handleCloseSelectedListing = useCallback(() => {
    setSelectedListing(null);
    setPopupPosition(null);
    if (overlayRef.current) {
      overlayRef.current.setPosition(undefined);
    }
    if (mapRef.current) {
      mapRef.current.getView().animate({
        center: fromLonLat([-0.1278, 51.5074]),
        zoom: 13,
        duration: 500,
      });
    }
  }, []);

  const toggleView = () => {
    setShowMap((prev) => !prev);
    // Close the selected listing when switching from map to list view on mobile
    if (showMap && window.innerWidth < 1024) {
      handleCloseSelectedListing();
    }
  };

  return (
    <div className="relative w-full h-[calc(120vh-70px)] lg:h-[calc(100vh-90px)] flex flex-col lg:flex-row">
      <EssentialsButtons
        showMore={true}
        selectedOptions={selectedOptions}
        toggleOption={toggleOption}
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
      />

      {isLoading && <LoadingTimeout />}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-md">
          {error}
        </div>
      )}
      <div className={`w-full lg:w-1/2 h-full overflow-hidden flex flex-col ${
        showMap ? "hidden lg:flex" : "flex"
      }`}>
        <div className="flex justify-between items-center px-4">
          <p className="text-sm font-medium text-secondary p-4">
            {isLoading ? "Loading..." : `${listings.length} ${listings.length === 1 ? 'place' : 'places'} within map area`}
          </p>
          <div className="lg:block hidden">
            <Button
              variant="outline"
              className="text-xs md:text-sm h-9 px-6 rounded-full border-gray-300 hover:border-gray-400 transition-all duration-200 group"
              onClick={() => setIsModalOpen(true)}
            >
              <Image
                src="/images/filters.svg"
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 mr-2 group-hover:scale-110"
              />
              <span className="group-hover:text-gray-700">Filters</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingTimeout />
            </div>
          ) : listings.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">No providers found. Try adjusting your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {listings.map((listing) => (
                <div key={listing.id} className="cursor-pointer" onClick={() => handleListingClick(listing)}>
                  <CarouselCard slides={listing.slides} content={listing.content} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`relative w-full h-full ${showMap ? "flex" : "hidden lg:flex"}`}>
        <div id="map" className="w-full h-full"></div>
      </div>

      {popupPosition && selectedListing && (
        <div
          className="absolute  top-10 left-1/2 transform -translate-x-1/2 z-10 w-[300px]"
        >
          <div className="bg-white rounded-lg shadow-lg overflow-hidden p-4">
            <button
              onClick={handleCloseSelectedListing}
              className="absolute top-2 right-2 z-10 bg-white rounded-full p-1"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            <CarouselCard
              slides={selectedListing.slides}
              content={selectedListing.content}
              imageHeight="150px"
            />
          </div>
        </div>
      )}
      <div className="sticky bottom-10 w-full flex justify-center !z-10 lg:hidden">
        <button
          onClick={toggleView}
          className="bg-white px-4 py-2 gap-2 rounded-full shadow-md flex items-center"
          aria-label={showMap ? "Show List" : "Show Map"}
        >
          {showMap ? (
            <List className="w-5 h-5" />
          ) : (
            <MapIcon className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">
            {showMap ? "Show List" : "Show Map"}
          </span>
        </button>
      </div>
    </div>
  );
}
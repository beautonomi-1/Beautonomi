"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import CarouselCard from "@/app/home/components/carousel-card";
import MapIcon from "./../../../../public/images/map.svg";
import { X } from "lucide-react";

import slide1 from "../../../../public/images/hairdresser.jpg";
import slide2 from "../../../../public/images/istockphoto-921797424-612x612.jpg";
import slide3 from "../../../../public/images/istockphoto-1335216008-612x612.jpg";
import slide4 from "../../../../public/images/355803-1600x1066-eye-shapes-makeup_2421745885.jpg";

const ITEMS_PER_PAGE = 6;

function createPriceMarker(price: number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "custom-price-marker";
  el.style.backgroundColor = "white";
  el.style.borderRadius = "10px";
  el.style.padding = "5px 10px";
  el.style.fontWeight = "bold";
  el.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  el.textContent = `$${price}`;
  return el;
}

interface ListingItem {
  id: number;
  lat: number;
  lng: number;
  price: number;
  slides: { src: unknown; alt: string }[];
  content: {
    title: string;
    subtitle: string;
    dates: string;
    amountstatus: string;
    ratings: string;
    ratingsVisible: string;
    guestfav: string;
    iconType: string;
  };
}

const MapSlider = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [showMap, setShowMap] = useState(false);
  const [selectedListing, setSelectedListing] = useState<ListingItem | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onMarkerClickRef = useRef<(listing: ListingItem) => void>(() => {});

  const cardsData = [
    {
      slides: [
        { src: slide1, alt: "Slide 1" },
        { src: slide2, alt: "Slide 2" },
        { src: slide3, alt: "Slide 3" },
        { src: slide4, alt: "Slide 4" },
      ],
      content: {
        title: "Mashabola, India",
        subtitle: "Mountain Views",
        dates: "Mountain Views",
        amountstatus: "£786 Total",
        ratings: "4.89",
        ratingsVisible: "false",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
    {
      slides: [
        { src: slide2, alt: "Slide 1" },
        { src: slide3, alt: "Slide 2" },
        { src: slide4, alt: "Slide 3" },
        { src: slide1, alt: "Slide 4" },
      ],
      content: {
        title: "Adventure in Toyland",
        subtitle: "Mountain Views",
        dates: "Hosted by Toymaker",
        amountstatus: "Limited slots available",
        ratingsVisible: "false",
        ratings: "4.54",
        guestfav: "false",
        iconType: "share",
      },
    },
  ];

  const fullCardsData = useMemo(() => {
    const data = [...cardsData];
    while (data.length < 12) {
      data.push(...data.slice(0, 2));
    }
    return data;
  }, []);

  const listings: ListingItem[] = useMemo(
    () =>
      fullCardsData.map((card, index) => ({
        id: index + 1,
        lat: 51.5074 + (Math.random() - 0.5) * 0.01,
        lng: -0.1278 + (Math.random() - 0.5) * 0.01,
        price: Math.floor(Math.random() * 100) + 50,
        ...card,
      })),
    [fullCardsData]
  );

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCards = fullCardsData.slice(startIndex, endIndex);
  const totalPages = Math.ceil(fullCardsData.length / ITEMS_PER_PAGE);

  const handlePageClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const toggleMap = () => {
    setShowMap(!showMap);
  };

  const handleMarkerClick = (listing: ListingItem) => {
    setSelectedListing(listing);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [listing.lng, listing.lat],
        zoom: 15,
        duration: 500,
      });
    }
  };
  onMarkerClickRef.current = handleMarkerClick;

  const handleCloseSelectedListing = () => {
    setSelectedListing(null);
  };

  // Create/destroy Mapbox map when showMap toggles
  useEffect(() => {
    if (!showMap || !mapContainerRef.current) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-0.1278, 51.5074],
      zoom: 13,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    markersRef.current = listings.map((listing) => {
      const el = createPriceMarker(listing.price);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([listing.lng, listing.lat])
        .addTo(map);
      el.addEventListener("click", () => onMarkerClickRef.current(listing));
      return marker;
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [showMap, listings]);

  return (
    <div className="relative flex h-screen flex-col">
      <div
        className={`flex-1 w-full px-10 ${showMap ? "hidden" : "block"}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="grid grid-cols-1 gap-7 justify-center md:grid-cols-2 lg:justify-start">
          {paginatedCards.map((card, index) => (
            <CarouselCard
              key={index}
              slides={card.slides}
              content={card.content}
            />
          ))}
        </div>

        <div className="mb-6 mt-4 flex items-center justify-center space-x-2">
          <button
            className="rounded-full p-2 disabled:opacity-50"
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <svg
              className="h-4 w-4 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
            <button
              key={number}
              className={`h-8 w-8 rounded-full text-sm font-medium ${
                number === currentPage ? "bg-black text-white" : "text-gray-600"
              }`}
              onClick={() => handlePageClick(number)}
            >
              {number}
            </button>
          ))}

          <button
            className="rounded-full p-2 disabled:opacity-50"
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <svg
              className="h-4 w-4 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={`flex-1 w-full ${showMap ? "-mb-[450px] block" : "hidden"}`}
        style={{ height: showMap ? "100%" : 0 }}
      >
        {showMap && (
          <div ref={mapContainerRef} className="h-full w-full" />
        )}
      </div>

      <div className="!z-[999] fixed bottom-10 w-full flex justify-center">
        <button
          onClick={toggleMap}
          className="flex gap-2 rounded-full bg-white px-4 py-2 shadow-md"
          aria-label={showMap ? "Show List" : "Show Map"}
        >
          <Image
            src={MapIcon}
            alt={showMap ? "Show List" : "Show Map"}
            className="h-5 w-5"
          />
          <span className="text-sm font-medium">
            {showMap ? "Show List" : "Show Map"}
          </span>
        </button>
      </div>

      {selectedListing && (
        <div className="!z-[9999] fixed right-5 bottom-24 w-[302px] overflow-hidden rounded-2xl bg-white p-4 shadow-lg">
          <button
            onClick={handleCloseSelectedListing}
            className="absolute right-2 top-2 z-10 rounded-full bg-white p-1"
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
      )}
    </div>
  );
};

export default MapSlider;

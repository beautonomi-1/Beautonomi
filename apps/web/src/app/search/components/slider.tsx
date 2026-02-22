"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CarouselCard from "@/app/home/components/carousel-card";
import MapIcon from "./../../../../public/images/map.svg";
import { X } from "lucide-react";

// Import your slide images
import slide1 from "../../../../public/images/hairdresser.jpg";
import slide2 from "../../../../public/images/istockphoto-921797424-612x612.jpg";
import slide3 from "../../../../public/images/istockphoto-1335216008-612x612.jpg";
import slide4 from "../../../../public/images/355803-1600x1066-eye-shapes-makeup_2421745885.jpg";

const ITEMS_PER_PAGE = 6;

const createPriceIcon = (price: number) => {
  return L.divIcon({
    className: "custom-price-marker",
    html: `<div style="background-color: white; border-radius: 10px; padding: 5px 10px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">$${price}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

function MapUpdater({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

const MapSlider = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [showMap, setShowMap] = useState(false);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const mapRef = useRef<L.Map | null>(null);

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

  while (cardsData.length < 12) {
    cardsData.push(...cardsData.slice(0, 2));
  }

  const listings = cardsData.map((card, index) => ({
    id: index + 1,
    lat: 51.5074 + (Math.random() - 0.5) * 0.01,
    lng: -0.1278 + (Math.random() - 0.5) * 0.01,
    price: Math.floor(Math.random() * 100) + 50,
    ...card,
  }));

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCards = cardsData.slice(startIndex, endIndex);
  const totalPages = Math.ceil(cardsData.length / ITEMS_PER_PAGE);

  const handlePageClick = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const toggleMap = () => {
    setShowMap(!showMap);
  };

  const handleMarkerClick = (listing: any) => {
    setSelectedListing(listing);
    if (mapRef.current) {
      mapRef.current.setView([listing.lat, listing.lng], 15);
    }
  };

  const handleCloseSelectedListing = () => {
    setSelectedListing(null);
  };

  useEffect(() => {
    if (showMap && mapRef.current) {
      mapRef.current.invalidateSize();
    }
  }, [showMap]);

  return (
    <div className="relative flex flex-col h-screen">
      <div
        className={`flex-1 ${showMap ? "hidden" : "block"} w-full px-10`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-7 justify-center lg:justify-start">
          {paginatedCards.map((card, index) => (
            <CarouselCard
              key={index}
              slides={card.slides}
              content={card.content}
            />
          ))}
        </div>

        <div className="flex items-center justify-center mt-4 space-x-2 mb-6">
          <button
            className="p-2 rounded-full disabled:opacity-50"
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <svg
              className="w-4 h-4 text-gray-600"
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
            className="p-2 rounded-full disabled:opacity-50"
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <svg
              className="w-4 h-4 text-gray-600"
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
        className={`flex-1 w-full ${showMap ? "block -mb-[450px]" : "hidden"}`}
        style={{ height: showMap ? "h-screen" : "0" }}
      >
        {showMap && (
          <MapContainer
            center={[51.5074, -0.1278]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            ref={mapRef}
          >
            <MapUpdater center={[51.5074, -0.1278]} zoom={13} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {listings.map((listing) => (
              <Marker
                key={listing.id}
                position={[listing.lat, listing.lng]}
                icon={createPriceIcon(listing.price)}
                eventHandlers={{
                  click: () => handleMarkerClick(listing),
                }}
              />
            ))}
          </MapContainer>
        )}
      </div>

      <div className="fixed bottom-10 w-full flex justify-center !z-[999]">
        <button
          onClick={toggleMap}
          className="bg-white px-4 py-2 gap-2 rounded-full shadow-md flex items-center"
          aria-label={showMap ? "Show List" : "Show Map"}
        >
          <Image
            src={MapIcon}
            alt={showMap ? "Show List" : "Show Map"}
            className="w-5 h-5"
          />
          <span className="text-sm font-medium">
            {showMap ? "Show List" : "Show Map"}
          </span>
        </button>
      </div>

      {selectedListing && (
        <div className="fixed right-5 bottom-24 !z-[9999] bg-white rounded-2xl shadow-lg p-4 w-[302px] overflow-hidden">
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
      )}
    </div>
  );
};

export default MapSlider;

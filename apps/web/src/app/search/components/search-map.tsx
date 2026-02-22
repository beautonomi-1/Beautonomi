"use client"
import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const createPriceIcon = (price: number) => {
  return L.divIcon({
    className: 'custom-price-marker',
    html: `<div style="background-color: white; border-radius: 50%; padding: 5px 10px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">$${price}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
};

interface Listing {
  id: number;
  lat: number;
  lng: number;
  price: number;
  title: string;
  host: string;
  description: string;
  image: string;
}

const listings: Listing[] = [
  { id: 1, lat: 51.5074, lng: -0.1278, price: 82, title: "Room in London, UK", host: "Moza Mostafa", description: "Private room with Balcony & view", image: "/api/placeholder/400/300" },
  // ... (rest of the listings array remains unchanged)
];

const SearchMap: React.FC = () => {
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const handleMarkerClick = (listing: Listing) => {
    setSelectedListing(listing);
    if (mapRef.current) {
      mapRef.current.flyTo([listing.lat, listing.lng], 15, {
        duration: 0.5,
      });
    }
  };

  return (
    <div className="relative h-screen w-full">
      <MapContainer 
        center={[51.5074, -0.1278]} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
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
      {selectedListing && (
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 w-80 z-[1000]">
          <Card className="bg-white shadow-lg">
            <CardHeader className="p-4">
              <h3 className="text-lg font-semibold">{selectedListing.title}</h3>
            </CardHeader>
            <CardContent className="p-4">
              <div className="relative w-full h-40 mb-4">
                <Image 
                  src={selectedListing.image} 
                  alt={selectedListing.title} 
                  fill
                  sizes="320px"
                  className="rounded object-cover"
                />
              </div>
              <p className="text-sm mb-2">Stay with {selectedListing.host}</p>
              <p className="text-sm mb-4">{selectedListing.description}</p>
              <p className="font-bold text-lg">${selectedListing.price} / night</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SearchMap;
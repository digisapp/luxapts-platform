"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Mapbox access token - using public token for client-side
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// HTML escape for safe popup rendering
function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

interface MapListing {
  id: string;
  buildingId: string;
  buildingName: string;
  unitNumber: string;
  lat: number;
  lng: number;
  rent: number;
  beds: number;
  baths: number;
  sqft: number | null;
  neighborhood: string;
}

interface SearchMapProps {
  listings: MapListing[];
  center?: [number, number];
  zoom?: number;
  onListingClick?: (listingId: string) => void;
  onListingHover?: (listingId: string | null) => void;
  highlightedListingId?: string | null;
  className?: string;
}

export function SearchMap({
  listings,
  center = [-73.99, 40.73], // Default to NYC
  zoom = 12,
  onListingClick,
  onListingHover,
  highlightedListingId,
  className = "",
}: SearchMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    if (!MAPBOX_TOKEN) {
      console.warn("Mapbox token not configured");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: center,
      zoom: zoom,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      // Hide Mapbox's built-in neighborhood/subdivision labels to avoid
      // confusion with our own database-driven neighborhood labels
      const style = map.current?.getStyle();
      if (style?.layers) {
        for (const layer of style.layers) {
          if (
            layer.id === "settlement-subdivision-label" ||
            layer.id === "settlement-minor-label"
          ) {
            map.current?.setLayoutProperty(layer.id, "visibility", "none");
          }
        }
      }
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update center when it changes
  useEffect(() => {
    if (map.current && mapLoaded) {
      map.current.flyTo({ center, zoom, duration: 1000 });
    }
  }, [center, zoom, mapLoaded]);

  // Add/update markers when listings change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Group listings by building for clustering
    const buildingGroups = new Map<string, MapListing[]>();
    listings.forEach((listing) => {
      const key = `${listing.lat.toFixed(4)},${listing.lng.toFixed(4)}`;
      if (!buildingGroups.has(key)) {
        buildingGroups.set(key, []);
      }
      buildingGroups.get(key)!.push(listing);
    });

    // Create markers
    buildingGroups.forEach((buildingListings, key) => {
      const [lat, lng] = key.split(",").map(Number);
      const count = buildingListings.length;
      const firstListing = buildingListings[0];
      const minRent = Math.min(...buildingListings.map((l) => l.rent));
      const maxRent = Math.max(...buildingListings.map((l) => l.rent));

      // Create marker element
      const el = document.createElement("div");
      el.className = "map-marker";

      if (count > 1) {
        // Cluster marker
        el.innerHTML = `
          <div class="cluster-marker">
            <span class="cluster-count">${count}</span>
          </div>
        `;
        el.style.cssText = `
          cursor: pointer;
        `;
      } else {
        // Single marker
        const isHighlighted = highlightedListingId === firstListing.id;
        el.innerHTML = `
          <div class="single-marker ${isHighlighted ? "highlighted" : ""}">
            <span class="marker-price">$${(minRent / 1000).toFixed(1)}k</span>
          </div>
        `;
        el.style.cssText = `
          cursor: pointer;
        `;
      }

      // Create popup content (escaped to prevent XSS)
      const popupContent = count > 1
        ? `
          <div class="map-popup">
            <h4>${esc(firstListing.buildingName)}</h4>
            <p>${count} units available</p>
            <p class="popup-price">$${minRent.toLocaleString()} - $${maxRent.toLocaleString()}/mo</p>
            <p class="popup-neighborhood">${esc(firstListing.neighborhood)}</p>
          </div>
        `
        : `
          <div class="map-popup">
            <h4>${esc(firstListing.buildingName)}</h4>
            <p>Unit ${esc(firstListing.unitNumber)}</p>
            <p class="popup-price">$${firstListing.rent.toLocaleString()}/mo</p>
            <p class="popup-details">${firstListing.beds === 0 ? "Studio" : `${firstListing.beds} bed`} · ${firstListing.baths} bath${firstListing.sqft ? ` · ${firstListing.sqft} sqft` : ""}</p>
            <p class="popup-neighborhood">${esc(firstListing.neighborhood)}</p>
          </div>
        `;

      const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: false,
        className: "map-popup-container",
      }).setHTML(popupContent);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current!);

      // Event handlers
      el.addEventListener("click", () => {
        if (count === 1 && onListingClick) {
          onListingClick(firstListing.id);
        }
      });

      el.addEventListener("mouseenter", () => {
        if (count === 1 && onListingHover) {
          onListingHover(firstListing.id);
        }
        marker.togglePopup();
      });

      el.addEventListener("mouseleave", () => {
        if (onListingHover) {
          onListingHover(null);
        }
        marker.togglePopup();
      });

      markersRef.current.push(marker);
    });
  }, [listings, mapLoaded, highlightedListingId, onListingClick, onListingHover]);

  // Fit bounds to show all markers
  const fitBounds = useCallback(() => {
    if (!map.current || listings.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    listings.forEach((listing) => {
      bounds.extend([listing.lng, listing.lat]);
    });

    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15,
      duration: 1000,
    });
  }, [listings]);

  useEffect(() => {
    if (mapLoaded && listings.length > 0) {
      fitBounds();
    }
  }, [mapLoaded, fitBounds]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`bg-zinc-900 flex items-center justify-center ${className}`}>
        <p className="text-zinc-500 text-sm">Map requires Mapbox configuration</p>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        .cluster-marker {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border: 3px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: transform 0.2s;
        }
        .cluster-marker:hover {
          transform: scale(1.1);
        }
        .cluster-count {
          color: white;
          font-weight: 700;
          font-size: 14px;
        }
        .single-marker {
          padding: 6px 10px;
          border-radius: 20px;
          background: #18181b;
          border: 2px solid #3b82f6;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.2s;
        }
        .single-marker:hover,
        .single-marker.highlighted {
          background: #3b82f6;
          transform: scale(1.05);
        }
        .single-marker.highlighted {
          border-color: #22c55e;
          background: #22c55e;
        }
        .marker-price {
          color: white;
          font-weight: 600;
          font-size: 12px;
          white-space: nowrap;
        }
        .map-popup-container .mapboxgl-popup-content {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }
        .map-popup-container .mapboxgl-popup-tip {
          border-top-color: #18181b;
        }
        .map-popup h4 {
          color: white;
          font-weight: 600;
          font-size: 14px;
          margin: 0 0 4px 0;
        }
        .map-popup p {
          color: #a1a1aa;
          font-size: 12px;
          margin: 2px 0;
        }
        .map-popup .popup-price {
          color: #3b82f6;
          font-weight: 600;
          font-size: 14px;
        }
        .map-popup .popup-neighborhood {
          color: #71717a;
          font-size: 11px;
        }
      `}</style>
      <div ref={mapContainer} className={`w-full h-full ${className}`} />
    </>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Mapbox access token - using public token for client-side
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Default to NYC — module-level constant so the default param keeps a stable identity
const DEFAULT_CENTER: [number, number] = [-73.99, 40.73];

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
  center = DEFAULT_CENTER,
  zoom = 12,
  onListingClick,
  onListingHover,
  highlightedListingId,
  className = "",
}: SearchMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);
  const markerElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  // Tile/style requests rejected by Mapbox (401/403: bad token, URL
  // restriction, account billing hold) used to leave a silent black box.
  const [mapError, setMapError] = useState<string | null>(null);

  // Keep the latest props in refs so the marker/bounds effects don't re-run
  // when the parent re-renders with new identities but identical data
  // (inline callbacks and freshly-mapped arrays would otherwise destroy and
  // recreate every marker under the cursor on each hover)
  const listingsRef = useRef(listings);
  const onListingClickRef = useRef(onListingClick);
  const onListingHoverRef = useRef(onListingHover);
  useEffect(() => {
    listingsRef.current = listings;
    onListingClickRef.current = onListingClick;
    onListingHoverRef.current = onListingHover;
  });

  // Stable signature of the listing data — markers only rebuild when this changes
  const listingsKey = JSON.stringify(listings);

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

    let reportedError = false;
    map.current.on("error", (e) => {
      const status = (e as { error?: { status?: number } }).error?.status;
      if (status === 401 || status === 403) {
        if (!reportedError) {
          reportedError = true;
          console.error(`Mapbox rejected the request (${status}) — check the token's URL restrictions and account billing`);
        }
        setMapError("Map tiles are unavailable right now.");
      }
    });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init-once effect: center/zoom changes are handled by the flyTo effect below; re-running would destroy and recreate the map
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

    // Clear existing markers and any open popups
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    popupsRef.current.forEach((popup) => popup.remove());
    popupsRef.current = [];
    markerElsRef.current.clear();

    // Touch devices get tap-to-preview (popup) then tap-to-open; hover
    // devices keep hover-to-preview and click-to-open
    const hoverCapable = window.matchMedia("(hover: hover)").matches;
    let activePopup: mapboxgl.Popup | null = null;

    // Group listings by building for clustering
    const buildingGroups = new Map<string, MapListing[]>();
    listingsRef.current.forEach((listing) => {
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

      const priceLabel = minRent >= 10000
        ? `$${(minRent / 1000).toFixed(0)}k`
        : minRent >= 1000
          ? `$${(minRent / 1000).toFixed(1)}k`
          : `$${minRent}`;

      if (count > 1) {
        // Multi-unit building: show starting price with unit count badge
        el.innerHTML = `
          <div class="cluster-marker">
            <span class="marker-price">From ${priceLabel}</span>
            <span class="cluster-badge">${count}</span>
          </div>
        `;
        el.style.cssText = "cursor: pointer;";
      } else {
        // Single unit: show price pill (highlighting applied in a separate effect)
        el.innerHTML = `
          <div class="single-marker">
            <span class="marker-price">${priceLabel}</span>
          </div>
        `;
        el.style.cssText = "cursor: pointer;";
        markerElsRef.current.set(firstListing.id, el);
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

      // Popup is managed manually (not via marker.setPopup) so Mapbox's
      // built-in click-to-toggle can't fight the handlers below
      const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: false,
        closeOnClick: true,
        className: "map-popup-container",
      }).setHTML(popupContent);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      const openPopup = () => {
        if (activePopup && activePopup !== popup) {
          activePopup.remove();
        }
        activePopup = popup;
        if (!popup.isOpen()) {
          popup.setLngLat([lng, lat]).addTo(map.current!);
        }
      };
      const closePopup = () => {
        if (popup.isOpen()) {
          popup.remove();
        }
      };

      // Event handlers
      el.addEventListener("click", (e) => {
        // Keep the map's closeOnClick from racing this handler
        e.stopPropagation();
        if (hoverCapable) {
          onListingClickRef.current?.(firstListing.id);
        } else if (popup.isOpen()) {
          // Second tap: navigate
          onListingClickRef.current?.(firstListing.id);
        } else {
          // First tap: preview
          openPopup();
          if (count === 1) {
            onListingHoverRef.current?.(firstListing.id);
          }
        }
      });

      if (hoverCapable) {
        el.addEventListener("mouseenter", () => {
          if (count === 1) {
            onListingHoverRef.current?.(firstListing.id);
          }
          openPopup();
        });

        el.addEventListener("mouseleave", () => {
          onListingHoverRef.current?.(null);
          closePopup();
        });
      }

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });
  }, [listingsKey, mapLoaded]);

  // Toggle highlight class on existing marker elements without recreating markers
  useEffect(() => {
    markerElsRef.current.forEach((el, listingId) => {
      const inner = el.querySelector(".single-marker");
      if (inner) {
        inner.classList.toggle("highlighted", listingId === highlightedListingId);
      }
    });
  }, [highlightedListingId, listingsKey, mapLoaded]);

  // Fit bounds to show all markers
  const fitBounds = useCallback(() => {
    const current = listingsRef.current;
    if (!map.current || current.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    current.forEach((listing) => {
      bounds.extend([listing.lng, listing.lat]);
    });

    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15,
      duration: 1000,
    });
  }, []);

  useEffect(() => {
    if (mapLoaded && listingsRef.current.length > 0) {
      fitBounds();
    }
  }, [mapLoaded, fitBounds, listingsKey]);

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
        /* ── Cluster pin (multiple units per building) ── */
        .cluster-marker {
          position: relative;
          display: flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 20px;
          background: #18181b;
          border: 2px solid #6366f1;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          transition: all 0.2s;
          gap: 4px;
        }
        .cluster-marker:hover {
          background: #6366f1;
          transform: scale(1.05);
        }
        .cluster-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 9px;
          background: rgba(255,255,255,0.2);
          color: white;
          font-weight: 700;
          font-size: 10px;
          white-space: nowrap;
        }
        /* ── Single-unit pin ── */
        .single-marker {
          padding: 6px 10px;
          border-radius: 20px;
          background: #18181b;
          border: 2px solid #3b82f6;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.2s;
        }
        .single-marker:hover {
          background: #3b82f6;
          transform: scale(1.05);
        }
        .single-marker.highlighted {
          border-color: #f59e0b;
          background: #f59e0b;
          transform: scale(1.1);
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
      <div className={`relative w-full h-full ${className}`}>
        <div ref={mapContainer} className="absolute inset-0" />
        {mapError && (
          <div
            role="status"
            className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
          >
            <p className="text-sm text-zinc-300">{mapError} Listings are still available in the list.</p>
          </div>
        )}
      </div>
    </>
  );
}

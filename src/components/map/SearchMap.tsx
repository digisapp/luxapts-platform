"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Minus, Plus } from "lucide-react";
import { clusterByOverlap } from "./screen-cluster";

// Mapbox access token - using public token for client-side
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Default to NYC — module-level constant so the default param keeps a stable identity
const DEFAULT_CENTER: [number, number] = [-73.99, 40.73];

// Street level. At this zoom pins that still collide (buildings sharing an
// address) are fanned out into a stack instead of clustered, since zooming
// further can't separate them.
const MAX_ZOOM = 18;
// Clear space kept between rendered pins
const PIN_GAP = 4;

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

function shortPrice(rent: number): string {
  return rent >= 10000
    ? `$${(rent / 1000).toFixed(0)}k`
    : rent >= 1000
      ? `$${(rent / 1000).toFixed(1)}k`
      : `$${rent}`;
}

/** Diameter of a cluster's count bubble */
function bubbleSize(count: number): number {
  return count < 10 ? 40 : count < 100 ? 44 : 50;
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
  /** Set when one listing stands for a whole building (its "from" rent). */
  unitCount?: number;
  maxRent?: number;
}

type Padding = { top: number; right: number; bottom: number; left: number };

interface SearchMapProps {
  listings: MapListing[];
  center?: [number, number];
  zoom?: number;
  onBuildingClick?: (buildingId: string) => void;
  onBuildingHover?: (buildingId: string | null) => void;
  highlightedBuildingId?: string | null;
  /**
   * Touch preview. When set, tapping a pin on a touch device selects its
   * building (the parent shows a preview card) instead of opening the
   * built-in popup; tapping the selected pin again opens the building, and
   * tapping empty map clears the selection. Mouse users keep
   * hover-to-preview and click-to-open.
   */
  onBuildingSelect?: (buildingId: string | null) => void;
  selectedBuildingId?: string | null;
  /**
   * Space covered by floating UI over the map (buttons, preview card), in
   * px. Initial framing and cluster zooms keep pins out of it, and a
   * selected pin is panned out from under it.
   */
  overlayPadding?: Partial<Padding>;
  /**
   * Render zoom buttons as one horizontal row in the top-right corner instead
   * of Mapbox's vertical control, so they share the top band with the
   * parent's own floating buttons rather than sitting over the pins.
   */
  inlineZoomControls?: boolean;
  className?: string;
}

/** One pin per building */
interface Pin {
  id: string;
  lng: number;
  lat: number;
  el: HTMLElement;
  marker: mapboxgl.Marker;
  /** Rendered pill size, measured once per listings change */
  w: number;
  h: number;
  onMap: boolean;
}

interface ClusterMarker {
  el: HTMLElement;
  marker: mapboxgl.Marker;
  ids: string[];
}

export function SearchMap({
  listings,
  center,
  zoom = 12,
  onBuildingClick,
  onBuildingHover,
  highlightedBuildingId,
  onBuildingSelect,
  selectedBuildingId = null,
  overlayPadding,
  inlineZoomControls = false,
  className = "",
}: SearchMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pinsRef = useRef<Map<string, Pin>>(new Map());
  const clustersRef = useRef<Map<string, ClusterMarker>>(new Map());
  const popupsRef = useRef<mapboxgl.Popup[]>([]);
  // The element currently standing for each building: its own pill, or the
  // bubble of the cluster that swallowed it (so list-hover can light it)
  const displayElRef = useRef<Map<string, HTMLElement>>(new Map());
  const reclusterRef = useRef<() => void>(() => {});
  const [mapLoaded, setMapLoaded] = useState(false);
  // Tile/style requests rejected by Mapbox (401/403: bad token, URL
  // restriction, account billing hold) used to leave a silent black box.
  const [mapError, setMapError] = useState<string | null>(null);

  // Keep the latest props in refs so the marker/bounds effects don't re-run
  // when the parent re-renders with new identities but identical data
  // (inline callbacks and freshly-mapped arrays would otherwise destroy and
  // recreate every marker under the cursor on each hover)
  const listingsRef = useRef(listings);
  const onBuildingClickRef = useRef(onBuildingClick);
  const onBuildingHoverRef = useRef(onBuildingHover);
  const onBuildingSelectRef = useRef(onBuildingSelect);
  const highlightedRef = useRef(highlightedBuildingId ?? null);
  const selectedRef = useRef(selectedBuildingId);
  const paddingRef = useRef<Padding>({ top: 50, right: 50, bottom: 50, left: 50 });
  useEffect(() => {
    listingsRef.current = listings;
    onBuildingClickRef.current = onBuildingClick;
    onBuildingHoverRef.current = onBuildingHover;
    onBuildingSelectRef.current = onBuildingSelect;
    highlightedRef.current = highlightedBuildingId ?? null;
    selectedRef.current = selectedBuildingId;
    paddingRef.current = { top: 50, right: 50, bottom: 50, left: 50, ...overlayPadding };
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
    const hoverCapable = window.matchMedia("(hover: hover)").matches;

    // Open framed on the results when they're already loaded (the phone map
    // view mounts after the search), instead of flying in from the default
    const initial = listingsRef.current;
    const initialBounds = new mapboxgl.LngLatBounds();
    initial.forEach((l) => initialBounds.extend([l.lng, l.lat]));

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      ...(initial.length > 0
        ? { bounds: initialBounds, fitBoundsOptions: { padding: paddingRef.current, maxZoom: 15 } }
        : { center: center ?? DEFAULT_CENTER, zoom }),
      maxZoom: MAX_ZOOM,
      attributionControl: false,
    });

    // On touch screens rotation/tilt are accidental and a compass is one more
    // control over the pins; mouse users keep the default control
    if (!inlineZoomControls) {
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: hoverCapable }), "top-right");
    }
    if (!hoverCapable) {
      map.current.touchZoomRotate.disableRotation();
      map.current.touchPitch.disable();
      map.current.dragRotate.disable();
    }

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

    // Re-cluster while zooming (once per frame) and after every camera move
    let frame = 0;
    const scheduleRecluster = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        reclusterRef.current();
      });
    };
    map.current.on("zoom", scheduleRecluster);
    map.current.on("moveend", scheduleRecluster);
    map.current.on("resize", scheduleRecluster);

    // Tapping empty map dismisses the preview card
    map.current.on("click", (e) => {
      const target = e.originalEvent?.target as Element | null;
      if (target?.closest?.(".map-marker")) return;
      onBuildingSelectRef.current?.(null);
    });

    const pins = pinsRef.current;
    const clusters = clustersRef.current;
    const displayEls = displayElRef.current;
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.current?.remove();
      map.current = null;
      pins.clear();
      clusters.clear();
      displayEls.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init-once effect: center/zoom changes are handled by the flyTo effect below; re-running would destroy and recreate the map
  }, []);

  // Fly to an explicitly provided center (the search page frames on its
  // results instead, so it doesn't pass one)
  useEffect(() => {
    if (map.current && mapLoaded && center) {
      map.current.flyTo({ center, zoom, duration: 1000 });
    }
  }, [center, zoom, mapLoaded]);

  // Light the element standing for the hovered (list card) and selected
  // (preview card) buildings — a cluster bubble when they're inside one
  const applyHighlight = useCallback(() => {
    const state = new Map<HTMLElement, { hi: boolean; sel: boolean }>();
    displayElRef.current.forEach((el, id) => {
      const s = state.get(el) ?? { hi: false, sel: false };
      if (id === highlightedRef.current) s.hi = true;
      if (id === selectedRef.current) s.sel = true;
      state.set(el, s);
    });
    state.forEach(({ hi, sel }, el) => {
      const inner = el.firstElementChild;
      inner?.classList.toggle("highlighted", hi);
      inner?.classList.toggle("selected", sel);
      // Lift the lit pin above any neighbour it touches
      el.style.zIndex = sel ? "11" : hi ? "10" : "";
    });
  }, []);

  // Zoom into a cluster: frame its buildings clear of the floating UI, or at
  // least zoom in two steps when they're already framed
  const zoomToCluster = useCallback((ids: string[]) => {
    const m = map.current;
    if (!m) return;
    const bounds = new mapboxgl.LngLatBounds();
    ids.forEach((id) => {
      const pin = pinsRef.current.get(id);
      if (pin) bounds.extend([pin.lng, pin.lat]);
    });
    if (bounds.isEmpty()) return;
    const padding = paddingRef.current;
    const camera = m.cameraForBounds(bounds, { padding, maxZoom: MAX_ZOOM });
    const current = m.getZoom();
    if (camera?.zoom !== undefined && camera.zoom > current + 0.5) {
      m.fitBounds(bounds, { padding, maxZoom: MAX_ZOOM, duration: 600 });
    } else {
      m.easeTo({ center: bounds.getCenter(), zoom: Math.min(MAX_ZOOM, current + 2), duration: 600 });
    }
  }, []);

  // Recompute which pins collide at the current camera and swap them for
  // count bubbles; only the markers whose membership changed are touched
  useEffect(() => {
    reclusterRef.current = () => {
      const m = map.current;
      if (!m) return;
      const pins = [...pinsRef.current.values()];
      if (pins.length === 0) return;

      const clusters = clusterByOverlap(
        pins.map((pin) => {
          const p = m.project([pin.lng, pin.lat]);
          return { item: pin, x: p.x, y: p.y, w: pin.w, h: pin.h };
        }),
        bubbleSize,
        PIN_GAP
      );
      const atMaxZoom = m.getZoom() >= MAX_ZOOM - 0.01;

      const singles = new Map<string, [number, number]>(); // id -> pixel offset
      const wantedClusters = new Map<string, Pin[]>();
      for (const c of clusters) {
        if (c.items.length === 1) {
          singles.set(c.items[0].id, [0, 0]);
        } else if (atMaxZoom) {
          // Can't zoom any further (shared address): fan the pills out in a
          // column around their common point so each stays tappable
          const rowH = Math.max(...c.items.map((pin) => pin.h)) + PIN_GAP;
          const origin = m.project([c.items[0].lng, c.items[0].lat]);
          c.items.forEach((pin, i) => {
            const p = m.project([pin.lng, pin.lat]);
            singles.set(pin.id, [
              origin.x - p.x,
              origin.y - p.y + (i - (c.items.length - 1) / 2) * rowH,
            ]);
          });
        } else {
          const ids = c.items.map((pin) => pin.id).sort();
          wantedClusters.set(ids.join("|"), c.items);
        }
      }

      const display = displayElRef.current;
      display.clear();

      pinsRef.current.forEach((pin) => {
        const offset = singles.get(pin.id);
        if (offset) {
          pin.marker.setOffset(offset);
          if (!pin.onMap) {
            pin.marker.addTo(m);
            pin.onMap = true;
          }
          display.set(pin.id, pin.el);
        } else if (pin.onMap) {
          pin.marker.remove();
          pin.onMap = false;
        }
      });

      clustersRef.current.forEach((cluster, key) => {
        if (!wantedClusters.has(key)) {
          cluster.marker.remove();
          clustersRef.current.delete(key);
        }
      });

      const hoverCapable = window.matchMedia("(hover: hover)").matches;
      wantedClusters.forEach((members, key) => {
        let cluster = clustersRef.current.get(key);
        if (!cluster) {
          const ids = members.map((pin) => pin.id);
          const count = members.length;
          const size = bubbleSize(count);
          const el = document.createElement("div");
          el.className = "map-marker";
          el.setAttribute("role", "button");
          el.tabIndex = 0;
          el.setAttribute("aria-label", `${count} buildings here — zoom in`);
          el.innerHTML = `<div class="map-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`;
          const activate = (e: Event) => {
            e.stopPropagation();
            // Close any open preview first, then frame the cluster once the
            // parent has re-rendered without it (its padding shrinks)
            onBuildingSelectRef.current?.(null);
            requestAnimationFrame(() => zoomToCluster(ids));
          };
          el.addEventListener("click", activate);
          el.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              activate(e);
            }
          });
          if (hoverCapable) {
            el.title = `${count} buildings — click to zoom in`;
          }
          const lng = members.reduce((s, pin) => s + pin.lng, 0) / count;
          const lat = members.reduce((s, pin) => s + pin.lat, 0) / count;
          const marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
          cluster = { el, marker, ids };
          clustersRef.current.set(key, cluster);
        }
        for (const id of cluster.ids) display.set(id, cluster.el);
      });

      applyHighlight();
    };
  }, [applyHighlight, zoomToCluster]);

  // Build one pin per building when the listings change
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;

    // Clear existing markers and any open popups
    pinsRef.current.forEach((pin) => pin.marker.remove());
    pinsRef.current.clear();
    clustersRef.current.forEach((cluster) => cluster.marker.remove());
    clustersRef.current.clear();
    popupsRef.current.forEach((popup) => popup.remove());
    popupsRef.current = [];
    displayElRef.current.clear();

    // Touch devices get tap-to-preview then tap-to-open; hover devices keep
    // hover-to-preview and click-to-open
    const hoverCapable = window.matchMedia("(hover: hover)").matches;
    let activePopup: mapboxgl.Popup | null = null;

    const byBuilding = new Map<string, MapListing[]>();
    listingsRef.current.forEach((listing) => {
      if (!byBuilding.has(listing.buildingId)) byBuilding.set(listing.buildingId, []);
      byBuilding.get(listing.buildingId)!.push(listing);
    });

    // Pills are measured off-screen once so clustering works on their real size
    const measure = document.createElement("div");
    measure.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;";
    m.getCanvasContainer().appendChild(measure);
    const created: Pin[] = [];

    byBuilding.forEach((buildingListings, buildingId) => {
      const first = buildingListings[0];
      const { lat, lng } = first;
      const count = buildingListings.reduce((n, l) => n + (l.unitCount ?? 1), 0);
      const minRent = Math.min(...buildingListings.map((l) => l.rent));
      const maxRent = Math.max(...buildingListings.map((l) => l.maxRent ?? l.rent));
      const priceLabel = shortPrice(minRent);

      const el = document.createElement("div");
      el.className = "map-marker";
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute(
        "aria-label",
        `${first.buildingName}, ${count > 1 ? "from " : ""}$${minRent.toLocaleString()} a month`
      );
      el.innerHTML =
        count > 1
          ? `<div class="cluster-marker"><span class="marker-price">From ${priceLabel}</span><span class="cluster-badge">${count}</span></div>`
          : `<div class="single-marker"><span class="marker-price">${priceLabel}</span></div>`;

      // Popup content (escaped to prevent XSS)
      const popupContent = count > 1
        ? `
          <div class="map-popup">
            <h4>${esc(first.buildingName)}</h4>
            <p>${count} units available</p>
            <p class="popup-price">$${minRent.toLocaleString()} - $${maxRent.toLocaleString()}/mo</p>
            <p class="popup-neighborhood">${esc(first.neighborhood)}</p>
          </div>
        `
        : `
          <div class="map-popup">
            <h4>${esc(first.buildingName)}</h4>
            <p>Unit ${esc(first.unitNumber)}</p>
            <p class="popup-price">$${first.rent.toLocaleString()}/mo</p>
            <p class="popup-details">${first.beds === 0 ? "Studio" : `${first.beds} bed`} · ${first.baths} bath${first.sqft ? ` · ${first.sqft} sqft` : ""}</p>
            <p class="popup-neighborhood">${esc(first.neighborhood)}</p>
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
      popupsRef.current.push(popup);

      const openPopup = () => {
        if (activePopup && activePopup !== popup) activePopup.remove();
        activePopup = popup;
        if (!popup.isOpen()) popup.setLngLat([lng, lat]).addTo(m);
      };
      const closePopup = () => {
        if (popup.isOpen()) popup.remove();
      };

      const activate = () => {
        if (hoverCapable) {
          onBuildingClickRef.current?.(buildingId);
        } else if (onBuildingSelectRef.current) {
          // First tap: preview card. Second tap on the same pin: open it
          if (selectedRef.current === buildingId) onBuildingClickRef.current?.(buildingId);
          else onBuildingSelectRef.current(buildingId);
        } else if (popup.isOpen()) {
          onBuildingClickRef.current?.(buildingId);
        } else {
          openPopup();
          onBuildingHoverRef.current?.(buildingId);
        }
      };

      el.addEventListener("click", (e) => {
        // Keep the map's click handling (closeOnClick, deselect) out of it
        e.stopPropagation();
        activate();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });

      if (hoverCapable) {
        el.addEventListener("mouseenter", () => {
          onBuildingHoverRef.current?.(buildingId);
          openPopup();
        });
        el.addEventListener("mouseleave", () => {
          onBuildingHoverRef.current?.(null);
          closePopup();
        });
      }

      measure.appendChild(el);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]);
      created.push({ id: buildingId, lng, lat, el, marker, w: 0, h: 0, onMap: false });
    });

    for (const pin of created) {
      const pill = pin.el.firstElementChild as HTMLElement | null;
      pin.w = pill?.offsetWidth || 90;
      pin.h = pill?.offsetHeight || 32;
      pinsRef.current.set(pin.id, pin);
    }
    measure.remove();

    reclusterRef.current();
  }, [listingsKey, mapLoaded]);

  // Re-light pins when the hovered/selected building changes
  useEffect(() => {
    applyHighlight();
  }, [highlightedBuildingId, selectedBuildingId, listingsKey, mapLoaded, applyHighlight]);

  // Pan a newly selected pin out from under the preview card / buttons
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded || !selectedBuildingId) return;
    const pin = pinsRef.current.get(selectedBuildingId);
    if (!pin) return;
    const p = m.project([pin.lng, pin.lat]);
    const { clientWidth: w, clientHeight: h } = m.getContainer();
    const pad = paddingRef.current;
    const dx = p.x < pad.left ? p.x - pad.left : p.x > w - pad.right ? p.x - (w - pad.right) : 0;
    const dy = p.y < pad.top ? p.y - pad.top : p.y > h - pad.bottom ? p.y - (h - pad.bottom) : 0;
    if (dx || dy) m.panBy([dx, dy], { duration: 300 });
  }, [selectedBuildingId, mapLoaded]);

  // Fit bounds to show all markers
  const fitBounds = useCallback(() => {
    const current = listingsRef.current;
    if (!map.current || current.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    current.forEach((listing) => {
      bounds.extend([listing.lng, listing.lat]);
    });

    map.current.fitBounds(bounds, {
      padding: paddingRef.current,
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
        .map-marker {
          cursor: pointer;
          outline: none;
        }
        /* Touch: a taller invisible hit area around each pill */
        @media (hover: none) {
          .map-marker {
            padding: 6px 2px;
          }
          .mapboxgl-ctrl-group button {
            width: 40px;
            height: 40px;
          }
        }
        .map-marker:focus-visible > * {
          outline: 2px solid #22d3ee;
          outline-offset: 2px;
        }
        /* ── Multi-unit building pill ── */
        .cluster-marker {
          position: relative;
          display: flex;
          width: max-content;
          align-items: center;
          padding: 6px 10px;
          border-radius: 20px;
          background: #18181b;
          border: 2px solid rgba(255, 255, 255, 0.35);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          transition: all 0.2s;
          gap: 4px;
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
          width: max-content;
          padding: 6px 10px;
          border-radius: 20px;
          background: #18181b;
          border: 2px solid rgba(255, 255, 255, 0.35);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.2s;
        }
        /* Hovering a pin, or its building's card, lights it in the brand cyan */
        .single-marker:hover,
        .cluster-marker:hover,
        .single-marker.highlighted,
        .cluster-marker.highlighted,
        .single-marker.selected,
        .cluster-marker.selected {
          background: #22d3ee;
          border-color: #22d3ee;
          transform: scale(1.08);
        }
        .single-marker:hover .marker-price,
        .cluster-marker:hover .marker-price,
        .single-marker.highlighted .marker-price,
        .cluster-marker.highlighted .marker-price,
        .single-marker.selected .marker-price,
        .cluster-marker.selected .marker-price {
          color: #000;
        }
        .cluster-marker:hover .cluster-badge,
        .cluster-marker.highlighted .cluster-badge,
        .cluster-marker.selected .cluster-badge {
          background: rgba(0, 0, 0, 0.2);
          color: #000;
        }
        .marker-price {
          color: white;
          font-weight: 600;
          font-size: 12px;
          white-space: nowrap;
        }
        /* ── Geographic cluster: several buildings too close to read ── */
        .map-cluster {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: #fafafa;
          color: #09090b;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.18), 0 4px 14px rgba(0, 0, 0, 0.5);
          transition: background 0.2s, transform 0.2s;
        }
        .map-cluster:hover,
        .map-cluster.highlighted,
        .map-cluster.selected {
          background: #22d3ee;
          transform: scale(1.08);
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
          color: white;
          font-weight: 600;
          font-size: 14px;
        }
        .map-popup .popup-neighborhood {
          color: #71717a;
          font-size: 11px;
        }
      `}</style>
      <div className={`relative w-full h-full ${className}`}>
        {/* h-full/w-full, not just inset-0: mapbox-gl.css sets .mapboxgl-map to
            position: relative and, being unlayered, beats Tailwind v4's layered
            utilities — with inset-0 alone the map collapsed to 0px tall. */}
        <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
        {inlineZoomControls && (
          <div className="absolute right-3 top-3 z-10 flex gap-2">
            {[
              { label: "Zoom out", Icon: Minus, zoom: () => map.current?.zoomOut() },
              { label: "Zoom in", Icon: Plus, zoom: () => map.current?.zoomIn() },
            ].map(({ label, Icon, zoom: onZoom }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                onClick={onZoom}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-950/85 text-white shadow-lg shadow-black/40 backdrop-blur-xl transition-transform active:scale-95"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
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

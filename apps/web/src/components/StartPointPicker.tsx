"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Home,
  Loader2,
  MapPin,
  MousePointer2,
  Search,
} from "lucide-react";
import type {
  LayerGroup,
  Map as LeafletMap,
} from "leaflet";
import { formatLatLng } from "@/lib/geoUtils";
import type { LatLng } from "@/types/route";
import { apiUrl } from "@/lib/api-client/routing";

type StartMode = "current" | "search" | "map" | "saved";

interface GeocodeResult {
  label: string;
  category?: string;
  point: LatLng;
}

const savedStart = {
  id: "saved" as const,
  label: "Saved location",
  helper: "Home base near the greenway",
  point: { lat: 40.0248, lng: -105.2521 },
  icon: Home,
};

const defaultMapCenter: LatLng = { lat: 40.0149, lng: -105.2705 };

function samePoint(a?: LatLng, b?: LatLng) {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
}

function formatCoordinate(point?: LatLng) {
  return point ? formatLatLng(point) : "No start selected";
}

export function StartPointPicker({
  value,
  onChange,
}: {
  value?: LatLng;
  onChange: (value: LatLng) => void;
}) {
  const [activeMode, setActiveMode] = useState<StartMode | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LatLng | undefined>();
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function useCurrentLocation() {
    setActiveMode("current");
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Your browser does not expose location access.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCurrentLocation(point);
        onChange(point);
        setIsLocating(false);
      },
      (error) => {
        setLocationError(error.message || "Location permission was denied.");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  function selectSavedLocation() {
    setActiveMode("saved");
    onChange(savedStart.point);
  }

  const currentSelected = activeMode === "current" && samePoint(value, currentLocation);
  const savedSelected = activeMode === "saved" && samePoint(value, savedStart.point);
  const showMapPanel = activeMode === "search" || activeMode === "map";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={isLocating}
          className={`min-h-40 rounded-lg border p-4 text-left transition disabled:cursor-wait ${
            currentSelected
              ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
              : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
          }`}
        >
          {isLocating ? <Loader2 size={24} className="animate-spin" /> : <Crosshair size={24} />}
          <span className="mt-6 block text-xl font-semibold">Current location</span>
          <span className={`mt-2 block text-sm ${currentSelected ? "text-emerald-50" : "text-stone-600"}`}>
            {currentSelected ? formatCoordinate(currentLocation) : "Use this device's current position"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode("search")}
          className={`min-h-40 rounded-lg border p-4 text-left transition ${
            activeMode === "search"
              ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
              : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
          }`}
        >
          <Search size={24} />
          <span className="mt-6 block text-xl font-semibold">Search address</span>
          <span className={`mt-2 block text-sm ${activeMode === "search" ? "text-emerald-50" : "text-stone-600"}`}>
            {activeMode === "search" && value ? formatCoordinate(value) : "Find an address or place"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode("map")}
          className={`min-h-40 rounded-lg border p-4 text-left transition ${
            activeMode === "map"
              ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
              : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
          }`}
        >
          <MapPin size={24} />
          <span className="mt-6 block text-xl font-semibold">Pick on map</span>
          <span className={`mt-2 block text-sm ${activeMode === "map" ? "text-emerald-50" : "text-stone-600"}`}>
            {activeMode === "map" && value ? formatCoordinate(value) : "Click the map below"}
          </span>
        </button>

        <button
          type="button"
          onClick={selectSavedLocation}
          className={`min-h-40 rounded-lg border p-4 text-left transition ${
            savedSelected
              ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
              : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
          }`}
        >
          <savedStart.icon size={24} />
          <span className="mt-6 block text-xl font-semibold">{savedStart.label}</span>
          <span className={`mt-2 block text-sm ${savedSelected ? "text-emerald-50" : "text-stone-600"}`}>
            {savedSelected ? formatCoordinate(savedStart.point) : savedStart.helper}
          </span>
        </button>
      </div>

      {showMapPanel && (
        <StartLocationMap
          mode={activeMode}
          value={value}
          onChange={onChange}
        />
      )}

      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-700">
        Start point: {formatCoordinate(value)}
      </div>

      {locationError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {locationError}
        </p>
      )}
    </div>
  );
}

function StartLocationMap({
  mode,
  value,
  onChange,
}: {
  mode: Extract<StartMode, "search" | "map">;
  value?: LatLng;
  onChange: (value: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  const initialCenterRef = useRef(value ?? defaultMapCenter);
  const initialZoomRef = useRef(value ? 15 : 13);
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCenteringLocation, setIsCenteringLocation] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const L = await import("leaflet");

      if (cancelled || !containerRef.current) {
        return;
      }

      const center = initialCenterRef.current;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        scrollWheelZoom: true,
      }).setView([center.lat, center.lng], initialZoomRef.current);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setLeaflet(L);

      if (!initialCenterRef.current || samePoint(initialCenterRef.current, defaultMapCenter)) {
        centerOnCurrentLocation(map);
      }

      map.on("click", (event) => {
        onChangeRef.current({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        });
      });
    }

    mountMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  function centerOnCurrentLocation(map = mapRef.current) {
    if (!map || !navigator.geolocation) {
      setSearchMessage("Your browser does not expose location access.");
      return;
    }

    setIsCenteringLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        onChangeRef.current(point);
        map.setView([point.lat, point.lng], 15);
        setIsCenteringLocation(false);
      },
      (error) => {
        setSearchMessage(error.message || "Location permission was denied.");
        setIsCenteringLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  useEffect(() => {
    if (!leaflet || !mapRef.current || !markerLayerRef.current) {
      return;
    }

    markerLayerRef.current.clearLayers();

    if (!value) {
      return;
    }

    leaflet.circleMarker([value.lat, value.lng], {
      radius: 10,
      color: "#ffffff",
      fillColor: "#064e3b",
      fillOpacity: 1,
      weight: 4,
    }).addTo(markerLayerRef.current);
    mapRef.current.setView([value.lat, value.lng], Math.max(mapRef.current.getZoom(), 15));
  }, [leaflet, value]);

  async function searchAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setSearchMessage("Enter at least two characters.");
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);

    try {
      const response = await fetch(apiUrl(`/api/geocode/search?q=${encodeURIComponent(trimmedQuery)}`));

      if (!response.ok) {
        throw new Error("Address search failed.");
      }

      const data = (await response.json()) as { results?: GeocodeResult[]; message?: string };
      const nextResults = data.results ?? [];

      setResults(nextResults);
      setSearchMessage(nextResults.length === 0 ? "No matching places found." : null);
    } catch {
      setResults([]);
      setSearchMessage("Could not search addresses right now.");
    } finally {
      setIsSearching(false);
    }
  }

  function chooseResult(result: GeocodeResult) {
    onChange(result.point);
    mapRef.current?.setView([result.point.lat, result.point.lng], 16);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          {mode === "search" ? (
            <>
              <form onSubmit={searchAddress} className="flex gap-2">
                <label className="flex h-12 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search address or place"
                    className="min-w-0 flex-1 bg-transparent text-stone-950 outline-none placeholder:text-stone-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white hover:bg-emerald-950 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSearching ? <Loader2 size={17} className="animate-spin" /> : "Search"}
                </button>
              </form>

              <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
                {results.map((result) => (
                  <button
                    key={`${result.point.lat}-${result.point.lng}-${result.label}`}
                    type="button"
                    onClick={() => chooseResult(result)}
                    className="rounded-lg border border-stone-200 p-3 text-left text-sm hover:border-emerald-700 hover:bg-emerald-50"
                  >
                    <span className="block font-semibold text-stone-950">{result.label}</span>
                    {result.category && (
                      <span className="mt-1 block text-xs font-semibold text-stone-500">{result.category}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-start gap-3 rounded-lg bg-stone-50 p-4 text-sm font-semibold text-stone-700">
                <MousePointer2 className="mt-0.5 shrink-0" size={18} />
                <span>Click anywhere on the map to set the route start.</span>
              </div>
              <button
                type="button"
                onClick={() => centerOnCurrentLocation()}
                disabled={isCenteringLocation}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
              >
                {isCenteringLocation ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}
                Use current location
              </button>
            </div>
          )}

          {searchMessage && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {searchMessage}
            </p>
          )}

          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
            Selected: {formatCoordinate(value)}
          </div>
        </div>

        <div className="relative min-h-[380px] bg-stone-200">
          <div ref={containerRef} className="absolute inset-0" aria-label="Search address map" />
          <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-stone-950 shadow-sm">
            {isCenteringLocation ? "Finding your location..." : "OpenStreetMap"}
          </div>
        </div>
      </div>
    </section>
  );
}

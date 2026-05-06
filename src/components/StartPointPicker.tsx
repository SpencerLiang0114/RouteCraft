"use client";

import { useState } from "react";
import { Crosshair, Home, Loader2, MapPin, Search } from "lucide-react";
import type { LatLng } from "@/types/route";

const starts = [
  {
    id: "search",
    label: "Search address",
    helper: "MVP mock address selection",
    point: { lat: 40.0174, lng: -105.2792 },
    icon: Search,
  },
  {
    id: "map",
    label: "Pick on map",
    helper: "Start from the trailhead marker",
    point: { lat: 40.0026, lng: -105.2937 },
    icon: MapPin,
  },
  {
    id: "saved",
    label: "Saved location",
    helper: "Home base near the greenway",
    point: { lat: 40.0248, lng: -105.2521 },
    icon: Home,
  },
];

function samePoint(a?: LatLng, b?: LatLng) {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
}

function formatCoordinate(point?: LatLng) {
  if (!point) {
    return "No start selected";
  }

  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

export function StartPointPicker({
  value,
  onChange,
}: {
  value?: LatLng;
  onChange: (value: LatLng) => void;
}) {
  const [currentLocation, setCurrentLocation] = useState<LatLng | undefined>();
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function useCurrentLocation() {
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

  const currentSelected = samePoint(value, currentLocation);

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

        {starts.map((start) => {
          const Icon = start.icon;
          const selected = samePoint(value, start.point);

          return (
            <button
              key={start.id}
              type="button"
              onClick={() => onChange(start.point)}
              className={`min-h-40 rounded-lg border p-4 text-left transition ${
                selected
                  ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
                  : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
              }`}
            >
              <Icon size={24} />
              <span className="mt-6 block text-xl font-semibold">{start.label}</span>
              <span className={`mt-2 block text-sm ${selected ? "text-emerald-50" : "text-stone-600"}`}>
                {selected ? formatCoordinate(start.point) : start.helper}
              </span>
            </button>
          );
        })}
      </div>

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

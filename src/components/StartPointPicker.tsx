import { Crosshair, Home, MapPin, Search } from "lucide-react";
import type { LatLng } from "@/types/route";

const starts = [
  {
    id: "current",
    label: "Current location",
    helper: "Use a demo current-location point",
    point: { lat: 40.0149, lng: -105.2705 },
    icon: Crosshair,
  },
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

export function StartPointPicker({
  value,
  onChange,
}: {
  value?: LatLng;
  onChange: (value: LatLng) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {starts.map((start) => {
        const Icon = start.icon;
        const selected = value?.lat === start.point.lat && value?.lng === start.point.lng;

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
              {start.helper}
            </span>
          </button>
        );
      })}
    </div>
  );
}

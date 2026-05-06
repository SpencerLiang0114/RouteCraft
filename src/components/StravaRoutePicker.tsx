"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bike,
  Crosshair,
  LocateFixed,
  Mountain,
  Navigation,
  Search,
  Timer,
  X,
} from "lucide-react";
import { mockStravaRoutes, normalizeExternalRoute } from "@/lib/mockRoutes";
import { formatActivity, getRouteBounds } from "@/lib/geoUtils";
import { useRouteStore } from "@/store/routeStore";
import type { ExternalRouteMock, LatLng } from "@/types/route";

type StravaFilter = "all" | "running" | "cycling";

const demoLocation = { lat: 42.447, lng: -76.485 };
const filters: Array<{ label: string; value: StravaFilter }> = [
  { label: "All Sports", value: "all" },
  { label: "Run", value: "running" },
  { label: "Ride", value: "cycling" },
];

const places = [
  { label: "Fall Creek", point: { lat: 42.455, lng: -76.49 } },
  { label: "Beebe Lake", point: { lat: 42.455, lng: -76.471 } },
  { label: "Collegetown", point: { lat: 42.441, lng: -76.485 } },
  { label: "East Hill", point: { lat: 42.446, lng: -76.455 } },
];

export function StravaRoutePicker() {
  const router = useRouter();
  const setResults = useRouteStore((state) => state.setResults);
  const [filter, setFilter] = useState<StravaFilter>("all");
  const [selectedRouteId, setSelectedRouteId] = useState(mockStravaRoutes[0]?.id ?? "");
  const [userLocation, setUserLocation] = useState<LatLng>(demoLocation);
  const [locationLabel, setLocationLabel] = useState("Ithaca demo location");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const nearbyRoutes = useMemo(
    () => translateRoutesToLocation(mockStravaRoutes, userLocation),
    [userLocation],
  );
  const visibleRoutes = nearbyRoutes.filter((route) => filter === "all" || route.activity === filter);
  const selectedRoute =
    visibleRoutes.find((route) => route.id === selectedRouteId) ?? visibleRoutes[0] ?? nearbyRoutes[0];
  const bounds = getRouteBounds([...visibleRoutes.map((route) => route.geometry), [userLocation]]);

  function analyzeSelectedRoute() {
    if (!selectedRoute) {
      return;
    }

    const candidate = normalizeExternalRoute(selectedRoute);
    setResults([candidate], candidate.id);
    router.push("/results");
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setLocationError("Browser location is not available here.");
      return;
    }

    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationLabel("Your current location");
      },
      () => setLocationError("Could not access your location. Using the demo map for now."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function searchDemoLocation() {
    const normalized = query.trim().toLowerCase();
    if (normalized.includes("cornell") || normalized.includes("ithaca") || normalized.length === 0) {
      setUserLocation(demoLocation);
      setLocationLabel("Ithaca demo location");
      setLocationError(null);
      return;
    }

    setLocationError("MVP search is mocked. Use browser location or try Ithaca/Cornell.");
  }

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
      <div className="grid min-h-[760px] lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="relative min-h-[620px] overflow-hidden bg-[#e9efe4]">
          <div className="absolute left-4 top-4 z-20 flex w-[min(680px,calc(100%-2rem))] flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex h-12 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 shadow-sm">
                <Search size={18} className="text-stone-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      searchDemoLocation();
                    }
                  }}
                  placeholder="Search for a location"
                  className="min-w-0 flex-1 bg-transparent font-semibold text-stone-800 outline-none placeholder:text-stone-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="grid size-7 place-items-center rounded-md text-stone-500 hover:bg-stone-100"
                    title="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={useBrowserLocation}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 font-semibold text-white shadow-sm hover:bg-orange-600"
              >
                <LocateFixed size={18} />
                Use location
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-sm ${
                    filter === item.value
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-stone-200 bg-white text-stone-700 hover:border-orange-500"
                  }`}
                >
                  {item.value === "cycling" ? <Bike size={16} /> : <Activity size={16} />}
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="absolute left-4 top-44 z-20 grid gap-2">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-md bg-white text-stone-900 shadow-sm"
              title="Map settings"
            >
              <Crosshair size={18} />
            </button>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-md bg-white text-stone-900 shadow-sm"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-md bg-white text-stone-900 shadow-sm"
              title="Zoom out"
            >
              -
            </button>
          </div>

          <div className="absolute bottom-4 left-4 z-20 rounded-lg bg-white/95 px-4 py-3 text-sm font-semibold text-stone-700 shadow-sm">
            {locationLabel}
            {locationError && <span className="ml-2 text-orange-700">{locationError}</span>}
          </div>

          <svg viewBox="0 0 1180 760" className="absolute inset-0 size-full">
            <MapTexture />
            <RouteDensity routes={visibleRoutes} bounds={bounds} />
            {visibleRoutes.map((route) => (
              <RouteOverlay
                key={route.id}
                route={route}
                bounds={bounds}
                selected={route.id === selectedRoute?.id}
                onSelect={() => setSelectedRouteId(route.id)}
              />
            ))}
            <PlaceMarkers bounds={bounds} userLocation={userLocation} />
          </svg>
        </div>

        <aside className="flex min-h-[760px] flex-col border-l border-stone-200 bg-[#fbfaf6]">
          <div className="border-b border-stone-200 p-5">
            <p className="font-semibold text-orange-600">Strava nearby</p>
            <h2 className="mt-1 text-3xl font-semibold text-stone-950">Routes around you</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Mock Strava routes are shown around the selected location. Click a line or card to inspect it.
            </p>
          </div>

          <div className="grid max-h-[455px] gap-3 overflow-y-auto p-4">
            {visibleRoutes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => setSelectedRouteId(route.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  route.id === selectedRoute?.id
                    ? "border-orange-600 bg-white shadow-lg"
                    : "border-stone-200 bg-white hover:border-orange-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-stone-950">{route.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-stone-500">
                      {formatActivity(route.activity)} · Strava
                    </p>
                  </div>
                  <span className="rounded-md bg-orange-50 px-2.5 py-1 text-sm font-semibold text-orange-700">
                    {Math.round((route.signals.novelty + route.signals.scenery) / 2)} heat
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <Metric icon={<Activity size={15} />} label="Distance" value={`${route.distanceKm} km`} />
                  <Metric icon={<Mountain size={15} />} label="Gain" value={`${route.elevationGainM} m`} />
                  <Metric
                    icon={<Timer size={15} />}
                    label="Time"
                    value={`${route.estimatedDurationMin ?? 0} min`}
                  />
                </dl>
              </button>
            ))}
          </div>

          {selectedRoute && (
            <div className="mt-auto border-t border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-stone-500">Selected route</p>
                  <h3 className="mt-1 text-2xl font-semibold text-stone-950">{selectedRoute.name}</h3>
                </div>
                <Navigation className="mt-1 text-orange-600" size={22} />
              </div>
              <button
                type="button"
                onClick={analyzeSelectedRoute}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white hover:bg-stone-950"
              >
                Analyze this route
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-stone-50 p-2">
      <dt className="flex items-center gap-1 text-stone-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-stone-950">{value}</dd>
    </div>
  );
}

function translateRoutesToLocation(routes: ExternalRouteMock[], location: LatLng) {
  const deltaLat = location.lat - demoLocation.lat;
  const deltaLng = location.lng - demoLocation.lng;

  return routes.map((route) => ({
    ...route,
    geometry: route.geometry.map((point) => ({
      lat: point.lat + deltaLat,
      lng: point.lng + deltaLng,
    })),
    waypoints: route.waypoints?.map((point) => ({
      lat: point.lat + deltaLat,
      lng: point.lng + deltaLng,
    })),
  }));
}

function MapTexture() {
  return (
    <g>
      <rect width="1180" height="760" fill="#e9efe4" />
      <path d="M0 124 C 196 54, 324 142, 488 96 S 854 22, 1180 82 L1180 0 L0 0 Z" fill="#bfedbd" />
      <path d="M0 604 C 230 500, 420 566, 594 488 S 914 374, 1180 444 L1180 760 L0 760 Z" fill="#bce8bf" />
      <path d="M0 396 C 186 330, 270 372, 410 330 S 688 236, 1180 286" fill="none" stroke="#95cdf3" strokeWidth="36" opacity="0.7" />
      <path d="M0 396 C 186 330, 270 372, 410 330 S 688 236, 1180 286" fill="none" stroke="#5fb1e5" strokeWidth="4" opacity="0.55" />
      <path d="M60 0 V760 M160 0 V760 M260 0 V760 M360 0 V760 M460 0 V760 M560 0 V760 M660 0 V760 M760 0 V760 M860 0 V760 M960 0 V760 M1060 0 V760" stroke="#cfd7d2" strokeWidth="3" opacity="0.65" />
      <path d="M0 90 H1180 M0 180 H1180 M0 270 H1180 M0 360 H1180 M0 450 H1180 M0 540 H1180 M0 630 H1180" stroke="#cfd7d2" strokeWidth="3" opacity="0.65" />
      <g fill="#6d786e" fontSize="20" fontWeight="700" opacity="0.62">
        <text x="154" y="198">Fall Creek</text>
        <text x="650" y="225">Beebe Lake</text>
        <text x="726" y="560">Collegetown</text>
        <text x="892" y="334">East Hill</text>
      </g>
    </g>
  );
}

function RouteDensity({
  routes,
  bounds,
}: {
  routes: ExternalRouteMock[];
  bounds: ReturnType<typeof getRouteBounds>;
}) {
  return (
    <g opacity="0.46">
      {routes.map((route) => (
        <path
          key={`density-${route.id}`}
          d={pathFor(route.geometry, bounds)}
          fill="none"
          stroke={route.activity === "cycling" ? "#2a7fdb" : "#74a8cf"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={route.activity === "cycling" ? 22 : 16}
          opacity={route.activity === "cycling" ? 0.32 : 0.42}
        />
      ))}
    </g>
  );
}

function RouteOverlay({
  route,
  bounds,
  selected,
  onSelect,
}: {
  route: ExternalRouteMock;
  bounds: ReturnType<typeof getRouteBounds>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g className="cursor-pointer" onClick={onSelect}>
      <path
        d={pathFor(route.geometry, bounds)}
        fill="none"
        stroke={selected ? "#fc4c02" : "#1f78c8"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={selected ? 9 : 5}
        opacity={selected ? 0.98 : 0.72}
      />
      {route.geometry.map((point, index) => {
        const projected = project(point, bounds);
        return (
          <circle
            key={`${route.id}-${index}`}
            cx={projected.x}
            cy={projected.y}
            r={selected ? 8 : 6}
            fill="#ffffff"
            stroke={selected ? "#fc4c02" : "#1f78c8"}
            strokeWidth="4"
          />
        );
      })}
    </g>
  );
}

function PlaceMarkers({
  bounds,
  userLocation,
}: {
  bounds: ReturnType<typeof getRouteBounds>;
  userLocation: LatLng;
}) {
  const user = project(userLocation, bounds);

  return (
    <g>
      {places.map((place, index) => {
        const projected = project(translatePointToLocation(place.point, userLocation), bounds);
        return (
          <g key={place.label}>
            <circle cx={projected.x} cy={projected.y} r="26" fill="#ffffff" opacity="0.92" />
            <circle
              cx={projected.x}
              cy={projected.y}
              r="20"
              fill={index % 2 === 0 ? "#517d64" : "#799fbd"}
              stroke="#ffffff"
              strokeWidth="4"
            />
            <text x={projected.x + 30} y={projected.y + 6} fill="#1c1917" fontSize="17" fontWeight="800">
              {place.label}
            </text>
          </g>
        );
      })}
      <circle cx={user.x} cy={user.y} r="18" fill="#ffffff" />
      <circle cx={user.x} cy={user.y} r="10" fill="#fc4c02" />
      <text x={user.x + 24} y={user.y + 7} fill="#1c1917" fontSize="18" fontWeight="800">
        You
      </text>
    </g>
  );
}

function translatePointToLocation(point: LatLng, location: LatLng) {
  return {
    lat: point.lat + location.lat - demoLocation.lat,
    lng: point.lng + location.lng - demoLocation.lng,
  };
}

function pathFor(geometry: LatLng[], bounds: ReturnType<typeof getRouteBounds>) {
  return geometry
    .map((point, index) => {
      const projected = project(point, bounds);
      return `${index === 0 ? "M" : "L"} ${projected.x} ${projected.y}`;
    })
    .join(" ");
}

function project(point: LatLng, bounds: ReturnType<typeof getRouteBounds>) {
  const padding = 72;
  const width = 1180 - padding * 2;
  const height = 760 - padding * 2;
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.001);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.001);

  return {
    x: padding + ((point.lng - bounds.minLng) / lngRange) * width,
    y: padding + (1 - (point.lat - bounds.minLat) / latRange) * height,
  };
}

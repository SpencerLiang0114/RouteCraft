"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type * as Leaflet from "leaflet";
import { mockStravaRoutes, normalizeExternalRoute } from "@/lib/mockRoutes";
import { formatActivity } from "@/lib/geoUtils";
import { useRouteStore } from "@/store/routeStore";
import type { ExternalRouteMock, LatLng } from "@/types/route";

type StravaFilter = "all" | "running" | "cycling";
type StravaStatus = "loading" | "live" | "mock" | "error";

const demoLocation = { lat: 42.447, lng: -76.485 };
const radiusOptions = [0.5, 1.5, 3, 6] as const;
const segmentLimitOptions = [20, 30, 40] as const;
const filters: Array<{ label: string; value: StravaFilter }> = [
  { label: "All Sports", value: "all" },
  { label: "Run", value: "running" },
  { label: "Ride", value: "cycling" },
];

export function StravaRoutePicker() {
  const router = useRouter();
  const setResults = useRouteStore((state) => state.setResults);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const routeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const selectRouteRef = useRef<(routeId: string) => void>(() => undefined);
  const [filter, setFilter] = useState<StravaFilter>("all");
  const [startingRadiusKm, setStartingRadiusKm] = useState<(typeof radiusOptions)[number]>(1.5);
  const [segmentLimit, setSegmentLimit] = useState<(typeof segmentLimitOptions)[number]>(20);
  const [selectedRouteId, setSelectedRouteId] = useState(mockStravaRoutes[0]?.id ?? "");
  const [apiRoutes, setApiRoutes] = useState<ExternalRouteMock[] | null>(null);
  const [stravaStatus, setStravaStatus] = useState<StravaStatus>("loading");
  const [stravaMessage, setStravaMessage] = useState("Loading Strava segments...");
  const [userLocation, setUserLocation] = useState<LatLng>(demoLocation);
  const [locationLabel, setLocationLabel] = useState("Ithaca demo location");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const mockNearbyRoutes = useMemo(
    () => translateRoutesToLocation(mockStravaRoutes, userLocation),
    [userLocation],
  );
  const nearbyRoutes = apiRoutes?.length ? apiRoutes : mockNearbyRoutes;
  const visibleRoutes = nearbyRoutes.filter((route) => filter === "all" || route.activity === filter);
  const selectedRoute =
    visibleRoutes.find((route) => route.id === selectedRouteId) ??
    visibleRoutes[0] ??
    nearbyRoutes[0] ??
    mockNearbyRoutes[0];

  useEffect(() => {
    selectRouteRef.current = setSelectedRouteId;
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStravaStatus("loading");
        setStravaMessage("Loading Strava segments near your current location...");
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationLabel("Your current location");
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    let disposed = false;

    async function createMap() {
      const leaflet = await import("leaflet");

      if (!mapContainerRef.current || disposed) {
        return;
      }

      leafletRef.current = leaflet;
      const map = leaflet
        .map(mapContainerRef.current, {
          attributionControl: true,
          zoomControl: false,
          preferCanvas: false,
        })
        .setView([demoLocation.lat, demoLocation.lng], 13);

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors · Strava segment data via official API",
          maxZoom: 19,
          crossOrigin: true,
        })
        .addTo(map);

      routeLayerRef.current = leaflet.layerGroup().addTo(map);
      markerLayerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;

      setTimeout(() => map.invalidateSize(), 0);
      setMapReady(true);
    }

    void createMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markerLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSegments() {
      const activity = filter === "cycling" ? "riding" : filter;
      const params = new URLSearchParams({
        lat: String(userLocation.lat),
        lng: String(userLocation.lng),
        activity,
        radiusKm: String(startingRadiusKm),
        limit: String(segmentLimit),
      });

      try {
        const response = await fetch(`/api/strava/segments?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          source: "strava-api" | "mock";
          segments: ExternalRouteMock[];
          message?: string;
        };

        if (controller.signal.aborted) {
          return;
        }

        if (data.source === "strava-api" && data.segments.length > 0) {
          setApiRoutes(data.segments);
          setSelectedRouteId(data.segments[0].id);
          setStravaStatus("live");
          setStravaMessage(
            `Showing ${data.segments.length} of up to ${segmentLimit} live Strava segment${data.segments.length === 1 ? "" : "s"} with a path inside ${startingRadiusKm} km.`,
          );
          return;
        }

        setApiRoutes(null);
        setStravaStatus(data.message ? "error" : "mock");
        setStravaMessage(data.message ?? "No live Strava segments returned here, showing mock routes.");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setApiRoutes(null);
        setStravaStatus("error");
        setStravaMessage(error instanceof Error ? error.message : "Could not load Strava segments.");
      }
    }

    void loadSegments();

    return () => controller.abort();
  }, [filter, segmentLimit, startingRadiusKm, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    const markerLayer = markerLayerRef.current;

    if (!mapReady || !leaflet || !map || !routeLayer || !markerLayer) {
      return;
    }

    routeLayer.clearLayers();
    markerLayer.clearLayers();

    for (const route of visibleRoutes) {
      const points = route.geometry.map((point) => leaflet.latLng(point.lat, point.lng));
      const selected = route.id === selectedRoute?.id;

      leaflet
        .polyline(points, {
          color: route.activity === "cycling" ? "#4169a8" : "#2f7fc8",
          weight: route.activity === "cycling" ? 20 : 16,
          opacity: 0.24,
          lineCap: "round",
          lineJoin: "round",
        })
        .addTo(routeLayer);

      if (selected) {
        leaflet
          .polyline(points, {
            color: "#ffffff",
            weight: 13,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          })
          .addTo(routeLayer);
      }

      const line = leaflet
        .polyline(points, {
          color: selected ? "#fc4c02" : "#287bc7",
          weight: selected ? 8 : 5,
          opacity: selected ? 1 : 0.92,
          lineCap: "round",
          lineJoin: "round",
        })
        .addTo(routeLayer);

      line.on("click", () => selectRouteRef.current(route.id));
    }

    const marker = leaflet.divIcon({
      className: "",
      html: '<div class="grid size-7 place-items-center rounded-full border-4 border-white bg-orange-600 shadow-lg"></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    leaflet.marker([userLocation.lat, userLocation.lng], { icon: marker }).addTo(markerLayer);

    const bounds = boundsForRoutes(leaflet, visibleRoutes, userLocation);
    map.invalidateSize();

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [80, 120],
        paddingBottomRight: [80, 80],
        maxZoom: 15,
      });
    } else {
      map.setView([userLocation.lat, userLocation.lng], 13);
    }
  }, [mapReady, selectedRoute?.id, userLocation, visibleRoutes]);

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
        setStravaStatus("loading");
        setStravaMessage("Loading Strava segments...");
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
      setStravaStatus("loading");
      setStravaMessage("Loading Strava segments...");
      setUserLocation(demoLocation);
      setLocationLabel("Ithaca demo location");
      setLocationError(null);
      return;
    }

    setLocationError("MVP search is mocked. Use browser location or try Ithaca/Cornell.");
  }

  function searchCurrentMapArea() {
    const center = mapRef.current?.getCenter();
    if (!center) {
      return;
    }

    setStravaStatus("loading");
    setStravaMessage("Loading Strava segments...");
    setUserLocation({ lat: center.lat, lng: center.lng });
    setLocationLabel("Current map center");
    setLocationError(null);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl">
      <div className="grid min-h-[760px] lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="relative min-h-[620px] overflow-hidden bg-stone-200">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" />

          <div className="pointer-events-none absolute left-4 top-4 z-20 flex w-[min(720px,calc(100%-2rem))] flex-col gap-3">
            <div className="pointer-events-auto flex flex-col gap-2 sm:flex-row">
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
            <div className="pointer-events-auto flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setStravaStatus("loading");
                    setStravaMessage("Loading Strava segments...");
                    setFilter(item.value);
                  }}
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
              <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1 text-sm font-semibold text-stone-700 shadow-sm">
                <span className="px-2 text-stone-500">Radius</span>
                {radiusOptions.map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    onClick={() => {
                      setStravaStatus("loading");
                      setStravaMessage("Loading Strava segments...");
                      setStartingRadiusKm(radius);
                    }}
                    className={`rounded-md px-3 py-1.5 ${
                      startingRadiusKm === radius
                        ? "bg-orange-600 text-white"
                        : "text-stone-700 hover:bg-orange-50"
                    }`}
                  >
                    {radius} km
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1 text-sm font-semibold text-stone-700 shadow-sm">
                <span className="px-2 text-stone-500">Segments</span>
                {segmentLimitOptions.map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => {
                      setStravaStatus("loading");
                      setStravaMessage("Loading Strava segments...");
                      setSegmentLimit(limit);
                    }}
                    className={`rounded-md px-3 py-1.5 ${
                      segmentLimit === limit
                        ? "bg-orange-600 text-white"
                        : "text-stone-700 hover:bg-orange-50"
                    }`}
                  >
                    {limit}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={searchCurrentMapArea}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 shadow-sm hover:border-orange-500"
              >
                <Crosshair size={16} />
                Search this area
              </button>
            </div>
          </div>

          <div className="absolute left-4 top-44 z-20 grid gap-2">
            <button
              type="button"
              onClick={() => mapRef.current?.setView([userLocation.lat, userLocation.lng], 14)}
              className="grid size-10 place-items-center rounded-md bg-white text-stone-900 shadow-sm"
              title="Recenter"
            >
              <Crosshair size={18} />
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              className="grid size-10 place-items-center rounded-md bg-white text-stone-900 shadow-sm"
              title="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              className="grid size-10 place-items-center rounded-md bg-white text-stone-900 shadow-sm"
              title="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
          </div>

          <div className="absolute bottom-4 left-4 z-20 rounded-lg bg-white/95 px-4 py-3 text-sm font-semibold text-stone-700 shadow-sm">
            {locationLabel}
            {locationError && <span className="ml-2 text-orange-700">{locationError}</span>}
          </div>
        </div>

        <aside className="flex min-h-[760px] flex-col border-l border-stone-200 bg-[#fbfaf6]">
          <div className="border-b border-stone-200 p-5">
            <p className="font-semibold text-orange-600">Strava nearby</p>
            <h2 className="mt-1 text-3xl font-semibold text-stone-950">Routes around you</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {stravaMessage} Click a line or card to inspect it.
            </p>
            <span
              className={`mt-3 inline-flex rounded-md px-3 py-1 text-sm font-semibold ${
                stravaStatus === "live"
                  ? "bg-emerald-100 text-emerald-900"
                  : stravaStatus === "loading"
                    ? "bg-stone-100 text-stone-700"
                    : "bg-orange-50 text-orange-700"
              }`}
            >
              {stravaStatus === "live"
                ? "Live Strava API"
                : stravaStatus === "loading"
                  ? "Loading"
                  : "Mock fallback"}
            </span>
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

function boundsForRoutes(
  leaflet: typeof Leaflet,
  routes: ExternalRouteMock[],
  userLocation: LatLng,
) {
  const points = routes
    .flatMap((route) => route.geometry)
    .concat(userLocation)
    .map((point) => leaflet.latLng(point.lat, point.lng));

  return leaflet.latLngBounds(points);
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

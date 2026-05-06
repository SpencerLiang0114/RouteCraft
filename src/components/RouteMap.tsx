"use client";

import { MapPinned, Navigation } from "lucide-react";
import type { LatLng, RouteCandidate } from "@/types/route";
import { getRouteBounds } from "@/lib/geoUtils";

export function RouteMap({
  routes,
  selectedRouteId,
  onSelectRoute,
}: {
  routes: RouteCandidate[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const bounds = getRouteBounds(routes.map((route) => route.geometry));

  return (
    <section className="relative min-h-[520px] overflow-hidden rounded-lg border border-stone-200 bg-[#dfe8d4] shadow-sm">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(39,80,56,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(39,80,56,0.08)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="absolute left-6 top-6 z-10 flex items-center gap-2 rounded-lg bg-white/90 px-4 py-3 font-semibold text-stone-950 shadow-sm">
        <MapPinned size={18} />
        Placeholder route map
      </div>
      <div className="absolute bottom-6 left-6 z-10 rounded-lg bg-white/90 px-4 py-3 text-sm text-stone-700 shadow-sm">
        MapLibre or Mapbox can replace this component when an API key is configured.
      </div>
      <svg viewBox="0 0 1000 640" className="absolute inset-0 size-full">
        <MapLabels />
        {routes.map((route) => {
          const selected = route.id === selectedRoute?.id;
          const path = pathFor(route.geometry, bounds);

          return (
            <g key={route.id}>
              <path
                d={path}
                fill="none"
                stroke={selected ? "#064e3b" : "#78716c"}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={selected ? 13 : 7}
                opacity={selected ? 0.98 : 0.42}
                className="cursor-pointer transition"
                onClick={() => onSelectRoute?.(route.id)}
              />
              {selected && (
                <path
                  d={path}
                  fill="none"
                  stroke="#f2c14e"
                  strokeDasharray="2 24"
                  strokeLinecap="round"
                  strokeWidth={5}
                />
              )}
            </g>
          );
        })}
        {selectedRoute && <RouteMarkers route={selectedRoute} bounds={bounds} />}
      </svg>
      <div className="absolute right-6 top-6 z-10 grid gap-2">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg bg-white text-stone-900 shadow-sm"
          title="Recenter"
        >
          <Navigation size={18} />
        </button>
      </div>
    </section>
  );
}

function MapLabels() {
  return (
    <g fill="#315841" opacity="0.42" fontSize="24" fontWeight="700">
      <text x="116" y="126">north park</text>
      <text x="638" y="172">bike lane</text>
      <text x="162" y="522">trailhead</text>
      <text x="624" y="512">greenway</text>
    </g>
  );
}

function RouteMarkers({
  route,
  bounds,
}: {
  route: RouteCandidate;
  bounds: ReturnType<typeof getRouteBounds>;
}) {
  const start = route.geometry[0];
  const end = route.geometry.at(-1) ?? start;
  const markers = [
    { point: start, label: "Start", color: "#064e3b" },
    { point: end, label: "End", color: "#b45309" },
  ];

  return (
    <g>
      {route.waypoints?.map((point, index) => {
        const projected = project(point, bounds);
        return (
          <circle
            key={`${point.lat}-${point.lng}-${index}`}
            cx={projected.x}
            cy={projected.y}
            r="10"
            fill="#ffffff"
            stroke="#0e7490"
            strokeWidth="5"
          />
        );
      })}
      {markers.map((marker) => {
        const projected = project(marker.point, bounds);
        return (
          <g key={marker.label}>
            <circle cx={projected.x} cy={projected.y} r="19" fill="#ffffff" />
            <circle cx={projected.x} cy={projected.y} r="11" fill={marker.color} />
            <text
              x={projected.x + 22}
              y={projected.y + 7}
              fill="#1c1917"
              fontSize="22"
              fontWeight="700"
            >
              {marker.label}
            </text>
          </g>
        );
      })}
    </g>
  );
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
  const padding = 86;
  const width = 1000 - padding * 2;
  const height = 640 - padding * 2;
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.001);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.001);

  return {
    x: padding + ((point.lng - bounds.minLng) / lngRange) * width,
    y: padding + (1 - (point.lat - bounds.minLat) / latRange) * height,
  };
}

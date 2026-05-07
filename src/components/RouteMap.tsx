"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Navigation } from "lucide-react";
import type {
  LatLngBoundsExpression,
  LatLngExpression,
  LayerGroup,
  Map as LeafletMap,
} from "leaflet";
import type { RouteCandidate } from "@/types/route";

const defaultCenter: LatLngExpression = [40.0149, -105.2705];

export function RouteMap({
  routes,
  selectedRouteId,
  onSelectRoute,
}: {
  routes: RouteCandidate[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const selectedBounds = useMemo(() => getRouteBounds(selectedRoute), [selectedRoute]);

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

      const map = L.map(containerRef.current, {
        zoomControl: false,
        scrollWheelZoom: true,
      }).setView(defaultCenter, 13);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      routeLayerRef.current = L.layerGroup().addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setLeaflet(L);
    }

    mountMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    const markerLayer = markerLayerRef.current;

    if (!leaflet || !map || !routeLayer || !markerLayer) {
      return;
    }

    routeLayer.clearLayers();
    markerLayer.clearLayers();

    if (selectedRoute) {
      const coordinates = selectedRoute.geometry.map((point) => [point.lat, point.lng] as LatLngExpression);

      if (coordinates.length >= 2) {
        leaflet.polyline(coordinates, {
          color: "#052e16",
          weight: 10,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(routeLayer);
        leaflet.polyline(coordinates, {
          color: "#f2c14e",
          weight: 4,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(routeLayer);
      }
    }

    if (selectedRoute) {
      addRouteMarkers(leaflet, markerLayer, selectedRoute);
    }

    if (selectedBounds) {
      map.fitBounds(selectedBounds, { padding: [42, 42], animate: false });
    }
  }, [leaflet, onSelectRoute, routes, selectedBounds, selectedRoute]);

  function recenter() {
    if (selectedBounds) {
      mapRef.current?.fitBounds(selectedBounds, { padding: [42, 42] });
      return;
    }

    mapRef.current?.setView(defaultCenter, 13);
  }

  return (
    <section className="relative min-h-[520px] overflow-hidden rounded-lg border border-stone-200 bg-stone-200 shadow-sm">
      <div ref={containerRef} className="absolute inset-0 z-0" aria-label="OpenStreetMap route map" />
      <div className="pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-lg bg-white/95 px-4 py-3 text-sm font-semibold text-stone-950 shadow-sm backdrop-blur">
        <Layers size={17} />
        OpenStreetMap
      </div>
      <div className="absolute right-4 top-4 z-[500] grid gap-2">
        <button
          type="button"
          onClick={recenter}
          className="grid size-11 place-items-center rounded-lg bg-white text-stone-900 shadow-sm hover:bg-emerald-50"
          title="Recenter"
        >
          <Navigation size={18} />
        </button>
      </div>
    </section>
  );
}

function addRouteMarkers(
  L: typeof import("leaflet"),
  markerLayer: LayerGroup,
  route: RouteCandidate,
) {
  const start = route.geometry[0];
  const end = route.geometry.at(-1) ?? start;

  if (start) {
    addMarker(L, markerLayer, [start.lat, start.lng], "#064e3b", "Start");
  }

  if (end) {
    addMarker(L, markerLayer, [end.lat, end.lng], "#b45309", "End");
  }

  for (const waypoint of route.waypoints ?? []) {
    L.circleMarker([waypoint.lat, waypoint.lng], {
      radius: 6,
      color: "#0e7490",
      fillColor: "#ffffff",
      fillOpacity: 1,
      weight: 3,
    }).addTo(markerLayer);
  }
}

function addMarker(
  L: typeof import("leaflet"),
  markerLayer: LayerGroup,
  point: LatLngExpression,
  color: string,
  label: string,
) {
  L.circleMarker(point, {
    radius: 10,
    color: "#ffffff",
    fillColor: color,
    fillOpacity: 1,
    weight: 4,
  })
    .bindTooltip(label, {
      permanent: true,
      direction: "right",
      offset: [12, 0],
      className: "routecraft-map-tooltip",
    })
    .addTo(markerLayer);
}

function getRouteBounds(route?: RouteCandidate): LatLngBoundsExpression | undefined {
  if (!route || route.geometry.length === 0) {
    return undefined;
  }

  return route.geometry.map((point) => [point.lat, point.lng] as [number, number]);
}

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
        scrollWheelZoom: false,
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
        addDirectionArrows(leaflet, routeLayer, selectedRoute.geometry);
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

  if (start && end && sameMapPoint(start, end)) {
    addCoincidentEndpointMarkers(L, markerLayer, [start.lat, start.lng]);
  } else if (start) {
    addStartMarker(L, markerLayer, [start.lat, start.lng]);
    if (end) {
      addFinishMarker(L, markerLayer, [end.lat, end.lng]);
    }
  }
}

function sameMapPoint(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001;
}

function addCoincidentEndpointMarkers(
  L: typeof import("leaflet"),
  markerLayer: LayerGroup,
  point: LatLngExpression,
) {
  const width = 52;
  const height = 28;
  const icon = L.divIcon({
    className: "",
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    html: `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;width:${width}px;height:${height}px">
        ${startDotHtml()}
        ${finishPointHtml()}
      </div>
    `,
  });

  L.marker(point, { icon, interactive: false }).addTo(markerLayer);
}

function startDotHtml() {
  return endpointDotHtml("#064e3b", "6 78 59");
}

function finishPointHtml() {
  return endpointDotHtml("#f97316", "249 115 22");
}

function endpointDotHtml(color: string, ringColor: string) {
  return `
    <span style="display:block;width:16px;height:16px;border:3px solid #fff;border-radius:999px;background:${color};box-shadow:0 8px 18px rgb(28 25 23 / 0.22),0 0 0 2px rgb(${ringColor} / 0.22)"></span>
  `;
}

function addStartMarker(
  L: typeof import("leaflet"),
  markerLayer: LayerGroup,
  point: LatLngExpression,
) {
  L.circleMarker(point, {
    radius: 10,
    color: "#ffffff",
    fillColor: "#064e3b",
    fillOpacity: 1,
    weight: 4,
  }).addTo(markerLayer);
}

function addFinishMarker(
  L: typeof import("leaflet"),
  markerLayer: LayerGroup,
  point: LatLngExpression,
) {
  L.circleMarker(point, {
    radius: 10,
    color: "#ffffff",
    fillColor: "#f97316",
    fillOpacity: 1,
    weight: 4,
  }).addTo(markerLayer);
}

function segmentBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function addDirectionArrows(
  L: typeof import("leaflet"),
  layer: LayerGroup,
  geometry: Array<{ lat: number; lng: number }>,
  intervalM = 1500,
) {
  if (geometry.length < 2) return;

  let accDistM = 0;
  let nextArrowAt = intervalM / 2;

  for (let i = 1; i < geometry.length; i++) {
    const prev = geometry[i - 1];
    const curr = geometry[i];
    const segDistM = L.latLng(prev.lat, prev.lng).distanceTo(L.latLng(curr.lat, curr.lng));

    while (accDistM + segDistM >= nextArrowAt) {
      const t = (nextArrowAt - accDistM) / segDistM;
      const lat = prev.lat + t * (curr.lat - prev.lat);
      const lng = prev.lng + t * (curr.lng - prev.lng);
      const deg = Math.round(segmentBearing(prev, curr));

      const icon = L.divIcon({
        html: `<div style="transform:rotate(${deg}deg);display:flex;align-items:center;justify-content:center;width:14px;height:14px"><svg viewBox="0 0 10 13" width="10" height="13" xmlns="http://www.w3.org/2000/svg"><polyline points="1,10 5,2 9,10" stroke="white" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([lat, lng], { icon, interactive: false }).addTo(layer);
      nextArrowAt += intervalM;
    }

    accDistM += segDistM;
  }
}

function getRouteBounds(route?: RouteCandidate): LatLngBoundsExpression | undefined {
  if (!route || route.geometry.length === 0) {
    return undefined;
  }

  return route.geometry.map((point) => [point.lat, point.lng] as [number, number]);
}

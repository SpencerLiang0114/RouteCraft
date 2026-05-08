import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Clock, Flag, Loader2, MapPin, MousePointer2, RotateCw, Route, Search } from "lucide-react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { formatLatLng } from "@/lib/geoUtils";
import type { LatLng, RouteType, UserPreferences } from "@/types/route";
import { apiUrl } from "@/lib/api-client/routing";

type RouteGoal = Extract<RouteType, "point_to_point" | "loop">;
type TargetMode = "distance" | "time";

const routeGoals: Array<{ value: RouteGoal; label: string; icon: typeof Route }> = [
  { value: "loop", label: "Loop route", icon: RotateCw },
  { value: "point_to_point", label: "Point-to-point", icon: Flag },
];

const targetModes: Array<{ value: TargetMode; label: string; icon: typeof Route }> = [
  { value: "distance", label: "Distance", icon: Route },
  { value: "time", label: "Time", icon: Clock },
];

const loopShapes: Array<{ value: Extract<RouteType, "loop" | "out_and_back">; label: string; icon: typeof Route }> = [
  { value: "out_and_back", label: "Out & back", icon: ArrowLeftRight },
  { value: "loop", label: "Loop", icon: RotateCw },
];

const distancePresetValues = [
  { label: "3 km", value: 3 },
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "21.1 km", value: 21.0975 },
  { label: "42.2 km", value: 42.195 },
];

const timePresetValues = [
  { label: "30 min", value: 30 },
  { label: "60 min", value: 60 },
  { label: "2 hr", value: 120 },
];

const defaultMapCenter: LatLng = { lat: 40.0149, lng: -105.2705 };

interface GeocodeResult {
  label: string;
  category?: string;
  point: LatLng;
}

function formatCoordinate(point?: LatLng) {
  return point ? formatLatLng(point) : "Not set";
}

export function RouteGoalSelector({
  preferences,
  onChange,
}: {
  preferences: UserPreferences;
  onChange: (preferences: UserPreferences) => void;
}) {
  const routeGoal: RouteGoal = preferences.routeType === "point_to_point" ? "point_to_point" : "loop";
  const targetMode: TargetMode = preferences.targetDurationMin ? "time" : "distance";
  const presetLabel = targetMode === "distance" ? "Distance presets" : "Time presets";

  function selectRouteGoal(nextGoal: RouteGoal) {
    onChange({
      ...preferences,
      routeType:
        nextGoal === "point_to_point"
          ? "point_to_point"
          : preferences.routeType === "loop"
            ? "loop"
            : "out_and_back",
    });
  }

  function selectTargetMode(nextMode: TargetMode) {
    if (nextMode === "distance") {
      onChange({
        ...preferences,
        targetDistanceKm: preferences.targetDistanceKm ?? 5,
        targetDurationMin: undefined,
      });
      return;
    }

    onChange({
      ...preferences,
      targetDistanceKm: undefined,
      targetDurationMin: preferences.targetDurationMin ?? 60,
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {routeGoals.map((goal) => {
          const Icon = goal.icon;
          const selected = routeGoal === goal.value;

          return (
            <button
              key={goal.value}
              type="button"
              onClick={() => selectRouteGoal(goal.value)}
              className={`min-h-32 rounded-lg border p-4 text-left ${
                selected
                  ? "border-emerald-800 bg-emerald-950 text-white"
                  : "border-stone-200 bg-white hover:border-emerald-700"
              }`}
            >
              <Icon size={23} />
              <span className="mt-5 block font-semibold">{goal.label}</span>
            </button>
          );
        })}
      </div>

      {routeGoal === "loop" && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="font-semibold text-stone-950">Route shape</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {loopShapes.map((shape) => {
              const Icon = shape.icon;
              const selected = preferences.routeType === shape.value;

              return (
                <button
                  key={shape.value}
                  type="button"
                  onClick={() => onChange({ ...preferences, routeType: shape.value })}
                  className={`flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3 text-left font-semibold ${
                    selected
                      ? "border-emerald-800 bg-emerald-950 text-white"
                      : "border-stone-200 bg-stone-50 text-stone-800 hover:border-emerald-700"
                  }`}
                >
                  <Icon size={19} />
                  {shape.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="font-semibold text-stone-950">Target</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {targetModes.map((mode) => {
            const Icon = mode.icon;
            const selected = targetMode === mode.value;

            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => selectTargetMode(mode.value)}
                className={`flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3 text-left font-semibold ${
                  selected
                    ? "border-emerald-800 bg-emerald-950 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-800 hover:border-emerald-700"
                }`}
              >
                <Icon size={19} />
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      <PresetRow
        label={presetLabel}
        values={targetMode === "distance" ? distancePresetValues : timePresetValues}
        customValue={targetMode === "distance" ? preferences.targetDistanceKm ?? 5 : preferences.targetDurationMin ?? 75}
        selectedValue={targetMode === "distance" ? preferences.targetDistanceKm : preferences.targetDurationMin}
        suffix={targetMode === "distance" ? "km" : "min"}
        onSelect={(value) =>
          targetMode === "distance"
            ? onChange({ ...preferences, targetDistanceKm: value, targetDurationMin: undefined })
            : onChange({ ...preferences, targetDurationMin: value, targetDistanceKm: undefined })
        }
        onCustom={(value) =>
          targetMode === "distance"
            ? onChange({ ...preferences, targetDistanceKm: value, targetDurationMin: undefined })
            : onChange({ ...preferences, targetDurationMin: value, targetDistanceKm: undefined })
        }
      />

      {routeGoal === "point_to_point" && (
        <PointToPointMap
          startPoint={preferences.startPoint}
          endPoint={preferences.endPoint}
          onStartChange={(pt) => onChange({ ...preferences, startPoint: pt })}
          onEndChange={(pt) => onChange({ ...preferences, endPoint: pt })}
        />
      )}
    </div>
  );
}

function PresetRow({
  label,
  values,
  selectedValue,
  customValue,
  suffix,
  onSelect,
  onCustom,
}: {
  label: string;
  values: Array<{ label: string; value: number }>;
  selectedValue?: number;
  customValue: number;
  suffix: string;
  onSelect: (value: number) => void;
  onCustom: (value: number) => void;
}) {
  const isCustom = selectedValue !== undefined && !values.some((item) => item.value === selectedValue);
  const defaultCustomValue = suffix === "km" ? 5 : 75;

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="font-semibold text-stone-950">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              selectedValue === item.value
                ? "bg-emerald-950 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-emerald-100"
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onCustom(isCustom ? customValue : defaultCustomValue)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            isCustom ? "bg-emerald-950 text-white" : "bg-stone-100 text-stone-700 hover:bg-emerald-100"
          }`}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <label className="mt-5 block text-sm font-semibold text-stone-700">
          Custom value: {customValue} {suffix}
          <input
            type="range"
            min={suffix === "km" ? 2 : 20}
            max={suffix === "km" ? 50 : 180}
            step={suffix === "km" ? 1 : 5}
            value={customValue}
            onChange={(event) => onCustom(Number(event.target.value))}
            className="mt-3 w-full accent-emerald-800"
          />
        </label>
      )}
    </div>
  );
}

function PointToPointMap({
  startPoint,
  endPoint,
  onStartChange,
  onEndChange,
}: {
  startPoint?: LatLng;
  endPoint?: LatLng;
  onStartChange: (pt: LatLng) => void;
  onEndChange: (pt: LatLng) => void;
}) {
  const [activePin, setActivePin] = useState<"start" | "end">(startPoint ? "end" : "start");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const onStartRef = useRef(onStartChange);
  const onEndRef = useRef(onEndChange);
  const activePinRef = useRef<"start" | "end">(startPoint ? "end" : "start");
  const initialCenterRef = useRef(startPoint ?? defaultMapCenter);
  const initialZoomRef = useRef(startPoint ? 14 : 13);
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  useEffect(() => { onStartRef.current = onStartChange; }, [onStartChange]);
  useEffect(() => { onEndRef.current = onEndChange; }, [onEndChange]);
  useEffect(() => { activePinRef.current = activePin; }, [activePin]);

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      if (!containerRef.current || mapRef.current) return;

      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

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

      map.on("click", (event) => {
        const pt = { lat: event.latlng.lat, lng: event.latlng.lng };
        if (activePinRef.current === "start") {
          onStartRef.current(pt);
          activePinRef.current = "end";
          setActivePin("end");
        } else {
          onEndRef.current(pt);
        }
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

  useEffect(() => {
    if (!leaflet || !markerLayerRef.current || !mapRef.current) return;

    markerLayerRef.current.clearLayers();

    if (startPoint) {
      leaflet.circleMarker([startPoint.lat, startPoint.lng], {
        radius: 10,
        color: "#ffffff",
        fillColor: "#064e3b",
        fillOpacity: 1,
        weight: 4,
      }).addTo(markerLayerRef.current);
    }

    if (endPoint) {
      leaflet.circleMarker([endPoint.lat, endPoint.lng], {
        radius: 10,
        color: "#ffffff",
        fillColor: "#9f1239",
        fillOpacity: 1,
        weight: 4,
      }).addTo(markerLayerRef.current);
    }

    if (startPoint && endPoint) {
      mapRef.current.fitBounds(
        [[startPoint.lat, startPoint.lng], [endPoint.lat, endPoint.lng]],
        { padding: [40, 40] },
      );
    } else if (startPoint) {
      mapRef.current.setView([startPoint.lat, startPoint.lng], Math.max(mapRef.current.getZoom(), 14));
    } else if (endPoint) {
      mapRef.current.setView([endPoint.lat, endPoint.lng], Math.max(mapRef.current.getZoom(), 14));
    }
  }, [leaflet, startPoint, endPoint]);

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
      if (!response.ok) throw new Error("Address search failed.");
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
    if (activePin === "start") {
      onStartChange(result.point);
      setActivePin("end");
      activePinRef.current = "end";
    } else {
      onEndChange(result.point);
    }
    mapRef.current?.setView([result.point.lat, result.point.lng], 16);
    setResults([]);
    setQuery("");
  }

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActivePin("start")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                activePin === "start"
                  ? "bg-emerald-950 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              <MapPin size={14} />
              Set start
            </button>
            <button
              type="button"
              onClick={() => setActivePin("end")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                activePin === "end"
                  ? "bg-rose-800 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              <Flag size={14} />
              Set end
            </button>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-stone-50 p-3 text-sm font-semibold text-stone-700">
            <MousePointer2 className="mt-0.5 shrink-0" size={16} />
            <span>
              Click the map or search to set the{" "}
              <span className={activePin === "start" ? "text-emerald-800" : "text-rose-800"}>
                {activePin} point
              </span>.
            </span>
          </div>

          <form onSubmit={searchAddress} className="flex gap-2">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${activePin} address`}
                className="min-w-0 flex-1 bg-transparent text-stone-950 outline-none placeholder:text-stone-500"
              />
            </label>
            <button
              type="submit"
              disabled={isSearching}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-semibold text-white hover:bg-emerald-950 disabled:cursor-wait disabled:opacity-60"
            >
              {isSearching ? <Loader2 size={15} className="animate-spin" /> : "Search"}
            </button>
          </form>

          {results.length > 0 && (
            <div className="grid max-h-48 gap-2 overflow-y-auto">
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
          )}

          {searchMessage && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {searchMessage}
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-800" />
              Start: {formatCoordinate(startPoint)}
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-950">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-rose-800" />
              End: {formatCoordinate(endPoint)}
            </div>
          </div>
        </div>

        <div className="relative min-h-[380px] bg-stone-200">
          <div ref={containerRef} className="absolute inset-0" aria-label="Point-to-point map" />
          <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-stone-950 shadow-sm">
            OpenStreetMap
          </div>
        </div>
      </div>
    </section>
  );
}

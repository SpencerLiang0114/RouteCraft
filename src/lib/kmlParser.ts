import type { RouteCandidate } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";
import { calculateRouteDistanceKm, slugify } from "./geoUtils";

export function parseKmlRoute(xml: string, fallbackName: string): RouteCandidate {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Invalid KML file.");
  }

  const name = document.querySelector("Placemark > name, Document > name")?.textContent;
  const coordinateElements = Array.from(document.querySelectorAll("LineString coordinates"));

  if (coordinateElements.length === 0) {
    throw new Error("KML route needs LineString coordinates.");
  }

  const combinedCoordinateText = coordinateElements
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  const rawPoints = combinedCoordinateText
    .trim()
    .split(/\s+/)
    .map((coordinate) => {
      const parts = coordinate.split(",").map(Number);
      return { lng: parts[0], lat: parts[1], elevation: parts[2] ?? 0 };
    });

  const geometry = rawPoints.map(({ lat, lng }) => ({ lat, lng }));

  if (geometry.length < 2 || geometry.some((point) => Number.isNaN(point.lat) || Number.isNaN(point.lng))) {
    throw new Error("KML route needs at least two valid coordinates.");
  }

  const hasElevation = rawPoints.some((p) => p.elevation !== 0);
  const elevationGainM = hasElevation
    ? rawPoints.reduce((gain, point, index) => {
        if (index === 0) return gain;
        const delta = point.elevation - rawPoints[index - 1].elevation;
        return delta > 0 ? gain + delta : gain;
      }, 0)
    : 0;

  let elevationProfile: { distanceKm: number; elevM: number }[] | undefined;
  if (hasElevation) {
    let accDistM = 0;
    elevationProfile = rawPoints.map((point, index) => {
      if (index > 0) {
        const prev = geometry[index - 1];
        const curr = geometry[index];
        const dLat = (curr.lat - prev.lat) * (Math.PI / 180);
        const dLng = (curr.lng - prev.lng) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(prev.lat * (Math.PI / 180)) * Math.cos(curr.lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
        accDistM += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      return { distanceKm: Math.round(accDistM / 10) / 100, elevM: Math.round(point.elevation) };
    });
  }

  // TODO: Improve KML import by supporting MultiGeometry, route names, and source-specific metadata.
  return analyzeRoute({
    id: `uploaded-${slugify(name ?? fallbackName)}`,
    source: "uploaded",
    name: name ?? fallbackName,
    activity: "hiking",
    routeType: "point_to_point",
    geometry,
    distanceKm: calculateRouteDistanceKm(geometry),
    elevationGainM: Math.round(elevationGainM),
    elevationProfile,
    signals: {
      parkAccess: 58,
      shadeCover: 44,
      roadExposure: 24,
      safety: 69,
      novelty: 54,
      scenery: 62,
      surfaceQuality: 68,
      intersectionComplexity: 28,
    },
    explanation: "Uploaded KML route parsed locally and normalized for RouteCraft analysis.",
  });
}

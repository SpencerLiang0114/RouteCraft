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
  const coordinateText = document.querySelector("LineString coordinates")?.textContent;

  if (!coordinateText) {
    throw new Error("KML route needs LineString coordinates.");
  }

  const geometry = coordinateText
    .trim()
    .split(/\s+/)
    .map((coordinate) => {
      const [lng, lat] = coordinate.split(",").map(Number);
      return { lat, lng };
    });

  if (geometry.length < 2 || geometry.some((point) => Number.isNaN(point.lat) || Number.isNaN(point.lng))) {
    throw new Error("KML route needs at least two valid coordinates.");
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
    elevationGainM: 0,
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

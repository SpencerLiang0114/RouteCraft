import type { RouteCandidate } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";
import { buildElevationProfile, calculateRouteDistanceKm, slugify } from "./geoUtils";
import {
  assertParsableXml,
  assertPointCount,
  computeElevationGainM,
  normalizeElevation,
  sanitizeCoordinate,
} from "./xmlUtils";

type ParsedPoint = {
  lat: number;
  lng: number;
  elevation: number | null;
};

function parseCoordinateToken(token: string): ParsedPoint | null {
  const parts = token.split(",");
  if (parts.length < 2) return null;

  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  const elevation = parts.length >= 3 ? normalizeElevation(parts[2]) : null;

  try {
    const coords = sanitizeCoordinate(lat, lng);
    return { ...coords, elevation };
  } catch {
    return null;
  }
}

function pointsFromCoordinateText(text: string): ParsedPoint[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCoordinateToken)
    .filter((point): point is ParsedPoint => point !== null);
}

export function parseKmlRoute(xml: string, fallbackName: string): RouteCandidate {
  const document = assertParsableXml(xml, "Invalid KML file.");

  const name = document.querySelector("Placemark > name, Document > name")?.textContent;
  const coordinateElements = Array.from(document.querySelectorAll("LineString coordinates"));

  if (coordinateElements.length === 0) {
    const hasPolygon = document.querySelector("Polygon") !== null;
    if (hasPolygon) {
      throw new Error("Unsupported KML geometry: Polygon-only files are not supported. Use a LineString.");
    }
    throw new Error("KML route needs LineString coordinates.");
  }

  const points = coordinateElements.flatMap((element) =>
    pointsFromCoordinateText(element.textContent ?? ""),
  );

  assertPointCount(points.length);

  if (points.length < 2) {
    throw new Error("KML route needs at least two valid coordinates.");
  }

  const elevations = points.map((point) => point.elevation);
  const hasElevation = elevations.some((elevation) => elevation !== null);
  const elevationGainM = hasElevation ? computeElevationGainM(elevations) : 0;
  const geometry = points.map(({ lat, lng }) => ({ lat, lng }));

  const elevationProfile = hasElevation
    ? buildElevationProfile(
        geometry,
        elevations.map((elevation) => elevation ?? 0),
      )
    : undefined;

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

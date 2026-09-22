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

function parseTrackPoint(point: Element): ParsedPoint | null {
  const lat = Number(point.getAttribute("lat"));
  const lng = Number(point.getAttribute("lon"));

  try {
    const coords = sanitizeCoordinate(lat, lng);
    return {
      ...coords,
      elevation: normalizeElevation(point.querySelector("ele")?.textContent),
    };
  } catch {
    return null;
  }
}

function pointsFromElements(elements: Iterable<Element>): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  for (const element of elements) {
    const point = parseTrackPoint(element);
    if (point) points.push(point);
  }
  return points;
}

function extractGpxPoints(document: Document): { points: ParsedPoint[]; trackName: string | null } {
  const tracks = Array.from(document.querySelectorAll("trk"));

  if (tracks.length > 0) {
    const trackPointSets = tracks.map((track) => ({
      name: track.querySelector("name")?.textContent ?? null,
      points: (() => {
        const segments = Array.from(track.querySelectorAll("trkseg"));
        if (segments.length === 0) {
          return pointsFromElements(track.querySelectorAll("trkpt"));
        }
        return segments.flatMap((segment) => pointsFromElements(segment.querySelectorAll("trkpt")));
      })(),
    }));

    const preferred = trackPointSets.find((track) => track.points.length >= 2);
    if (preferred) {
      return { points: preferred.points, trackName: preferred.name };
    }

    return {
      points: trackPointSets.flatMap((track) => track.points),
      trackName: trackPointSets.find((track) => track.name)?.name ?? null,
    };
  }

  return {
    points: pointsFromElements(document.querySelectorAll("rtept")),
    trackName: document.querySelector("rte > name")?.textContent ?? null,
  };
}

export function parseGpxRoute(xml: string, fallbackName: string): RouteCandidate {
  const document = assertParsableXml(xml, "Invalid GPX file.");

  const metadataName = document.querySelector("metadata > name")?.textContent ?? null;
  const { points, trackName } = extractGpxPoints(document);
  const name = trackName ?? metadataName;

  assertPointCount(points.length);

  if (points.length < 2) {
    throw new Error("GPX route needs at least two valid points.");
  }

  const elevations = points.map((point) => point.elevation);
  const hasElevation = elevations.some((elevation) => elevation !== null);
  const elevationGainM = hasElevation ? computeElevationGainM(elevations) : 0;
  const geometry = points.map(({ lat, lng }) => ({ lat, lng }));
  const distanceKm = calculateRouteDistanceKm(geometry);

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
    distanceKm,
    elevationGainM: Math.round(elevationGainM),
    elevationProfile,
    signals: {
      parkAccess: 62,
      shadeCover: 50,
      roadExposure: 22,
      safety: 70,
      novelty: 52,
      scenery: 64,
      surfaceQuality: 68,
      intersectionComplexity: 26,
    },
    explanation: "Uploaded GPX route parsed locally and normalized for RouteCraft analysis.",
  });
}

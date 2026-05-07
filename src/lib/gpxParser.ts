import type { RouteCandidate } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";
import { buildElevationProfile, calculateRouteDistanceKm, slugify } from "./geoUtils";

export function parseGpxRoute(xml: string, fallbackName: string): RouteCandidate {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Invalid GPX file.");
  }

  const name = document.querySelector("trk > name, rte > name, metadata > name")?.textContent;
  const points = Array.from(document.querySelectorAll("trkpt, rtept")).map((point) => ({
    lat: Number(point.getAttribute("lat")),
    lng: Number(point.getAttribute("lon")),
    elevation: Number(point.querySelector("ele")?.textContent ?? 0),
  }));

  if (points.length < 2 || points.some((point) => Number.isNaN(point.lat) || Number.isNaN(point.lng))) {
    throw new Error("GPX route needs at least two valid points.");
  }

  const hasElevation = points.some((p) => p.elevation !== 0);
  const elevationGainM = points.reduce((gain, point, index) => {
    if (index === 0) return gain;
    const delta = point.elevation - points[index - 1].elevation;
    return delta > 0 ? gain + delta : gain;
  }, 0);
  const geometry = points.map(({ lat, lng }) => ({ lat, lng }));
  const distanceKm = calculateRouteDistanceKm(geometry);

  const elevationProfile = hasElevation
    ? buildElevationProfile(geometry, points.map((p) => p.elevation))
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

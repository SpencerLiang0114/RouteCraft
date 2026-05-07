import type { RouteCandidate } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";
import { calculateRouteDistanceKm, slugify } from "./geoUtils";

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

  let elevationProfile: { distanceKm: number; elevM: number }[] | undefined;
  if (hasElevation) {
    let accDistM = 0;
    elevationProfile = points.map((point, index) => {
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

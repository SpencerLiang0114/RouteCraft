import type { RouteCandidate } from "@/types/route";
import { escapeXml } from "./xmlUtils";

export function routeToGpx(route: RouteCandidate) {
  const points = route.geometry
    .map(
      (point) =>
        `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lng.toFixed(6)}"></trkpt>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteCraft" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(route.name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}


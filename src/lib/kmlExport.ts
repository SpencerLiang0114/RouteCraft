import type { RouteCandidate } from "@/types/route";
import { escapeXml } from "./xmlUtils";

export function routeToKml(route: RouteCandidate) {
  const profile = route.elevationProfile;
  const elevationByIndex = profile?.length === route.geometry.length ? profile : undefined;

  const coordinates = route.geometry
    .map((point, i) => {
      const alt = elevationByIndex ? elevationByIndex[i].elevM : 0;
      return `${point.lng.toFixed(6)},${point.lat.toFixed(6)},${alt}`;
    })
    .join(" ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(route.name)}</name>
    <Placemark>
      <name>${escapeXml(route.name)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}


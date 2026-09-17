import { describe, expect, it } from "vitest";
import { parseGpxRoute } from "../gpxParser";
import { routeToGpx } from "../gpxExport";
import type { RouteCandidate } from "@/types/route";

const minimalGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Trail</name>
    <trkseg>
      <trkpt lat="37.7749" lon="-122.4194"></trkpt>
      <trkpt lat="37.7750" lon="-122.4195"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const gpxWithElevation = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Elevated Trail</name>
    <trkseg>
      <trkpt lat="37.7749" lon="-122.4194"><ele>10</ele></trkpt>
      <trkpt lat="37.7750" lon="-122.4195"><ele>25</ele></trkpt>
      <trkpt lat="37.7751" lon="-122.4196"><ele>40</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const singlePointGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <trkseg>
      <trkpt lat="37.7749" lon="-122.4194"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

function baseRoute(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    id: "test-route",
    source: "uploaded",
    name: "Export Trail",
    activity: "hiking",
    geometry: [
      { lat: 37.7749, lng: -122.4194 },
      { lat: 37.775, lng: -122.4195 },
    ],
    distanceKm: 0.1,
    estimatedDurationMin: 5,
    elevationGainM: 0,
    metrics: {
      parkScore: 50,
      shadeScore: 50,
      safetyScore: 50,
      explorationScore: 50,
      sceneryScore: 50,
      elevationScore: 50,
      distanceScore: 50,
      totalScore: 50,
    },
    explanation: "test",
    ...overrides,
  };
}

describe("parseGpxRoute", () => {
  it("parses a valid minimal GPX into geometry with at least two points", () => {
    const route = parseGpxRoute(minimalGpx, "Fallback");
    expect(route.geometry.length).toBeGreaterThanOrEqual(2);
    expect(route.name).toBe("Test Trail");
    expect(route.elevationProfile).toBeUndefined();
  });

  it("throws on invalid XML", () => {
    expect(() => parseGpxRoute("<not-valid", "Fallback")).toThrow("Invalid GPX file.");
  });

  it("throws when fewer than two points", () => {
    expect(() => parseGpxRoute(singlePointGpx, "Fallback")).toThrow(
      "GPX route needs at least two valid points.",
    );
  });

  it("includes elevationProfile when elevation is present", () => {
    const route = parseGpxRoute(gpxWithElevation, "Fallback");
    expect(route.elevationProfile).toBeDefined();
    expect(route.elevationProfile!.length).toBe(3);
    expect(route.elevationGainM).toBe(30);
  });
});

describe("routeToGpx", () => {
  it("exports track points with RouteCraft creator", () => {
    const gpx = routeToGpx(baseRoute());
    expect(gpx).toContain("creator=\"RouteCraft\"");
    expect(gpx).toContain("<trkpt");
    expect(gpx).toContain('lat="37.774900"');
  });

  it("omits elevation when profile length differs from geometry", () => {
    const gpx = routeToGpx(
      baseRoute({
        elevationProfile: [{ distanceKm: 0, elevM: 10 }],
      }),
    );
    expect(gpx).not.toContain("<ele>");
  });

  it("includes elevation when profile length matches geometry", () => {
    const gpx = routeToGpx(
      baseRoute({
        elevationProfile: [
          { distanceKm: 0, elevM: 10 },
          { distanceKm: 0.1, elevM: 20 },
        ],
      }),
    );
    expect(gpx).toContain("<ele>10</ele>");
    expect(gpx).toContain("<ele>20</ele>");
  });
});

import { describe, expect, it } from "vitest";
import { parseGpxRoute } from "../gpxParser";
import { MAX_UPLOAD_BYTES, MAX_XML_DEPTH } from "../xmlUtils";

function wrapGpx(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteCraftTest">
  ${body}
</gpx>`;
}

describe("parseGpxRoute", () => {
  it("parses a simple track with elevation", () => {
    const xml = wrapGpx(`
      <trk>
        <name>Ridge Run</name>
        <trkseg>
          <trkpt lat="37.77" lon="-122.42"><ele>10</ele></trkpt>
          <trkpt lat="37.78" lon="-122.43"><ele>25</ele></trkpt>
        </trkseg>
      </trk>`);

    const route = parseGpxRoute(xml, "fallback");
    expect(route.name).toBe("Ridge Run");
    expect(route.geometry).toHaveLength(2);
    expect(route.elevationProfile).toBeDefined();
    expect(route.elevationGainM).toBe(15);
  });

  it("concatenates multiple segments and prefers first track with enough points", () => {
    const xml = wrapGpx(`
      <trk>
        <name>Short</name>
        <trkseg>
          <trkpt lat="1" lon="1"/>
        </trkseg>
      </trk>
      <trk>
        <name>Long</name>
        <trkseg>
          <trkpt lat="37.77" lon="-122.42"/>
          <trkpt lat="37.771" lon="-122.421"/>
        </trkseg>
        <trkseg>
          <trkpt lat="37.772" lon="-122.422"/>
        </trkseg>
      </trk>`);

    const route = parseGpxRoute(xml, "fallback");
    expect(route.name).toBe("Long");
    expect(route.geometry).toHaveLength(3);
  });

  it("does not treat missing elevation as present", () => {
    const xml = wrapGpx(`
      <trk>
        <trkseg>
          <trkpt lat="37.77" lon="-122.42"/>
          <trkpt lat="37.78" lon="-122.43"/>
        </trkseg>
      </trk>`);

    const route = parseGpxRoute(xml, "fallback");
    expect(route.elevationProfile).toBeUndefined();
    expect(route.elevationGainM).toBe(0);
  });

  it("rejects invalid XML", () => {
    expect(() => parseGpxRoute("<gpx><trk>", "bad")).toThrow(/Invalid GPX/i);
  });

  it("rejects oversized content", () => {
    const huge = `<gpx>${"a".repeat(MAX_UPLOAD_BYTES + 1)}</gpx>`;
    expect(() => parseGpxRoute(huge, "huge")).toThrow(/too large/i);
  });

  it("rejects deeply nested XML", () => {
    const nested = `${"<a>".repeat(MAX_XML_DEPTH + 2)}x${"</a>".repeat(MAX_XML_DEPTH + 2)}`;
    expect(() => parseGpxRoute(nested, "deep")).toThrow(/too deep/i);
  });

  it("rejects antimeridian longitudes outside [-180, 180]", () => {
    const xml = wrapGpx(`
      <trk>
        <trkseg>
          <trkpt lat="10" lon="190"/>
          <trkpt lat="11" lon="191"/>
        </trkseg>
      </trk>`);

    expect(() => parseGpxRoute(xml, "anti")).toThrow(/at least two valid points/i);
  });

  it("skips invalid points but keeps valid ones", () => {
    const xml = wrapGpx(`
      <trk>
        <trkseg>
          <trkpt lat="37.77" lon="-122.42"/>
          <trkpt lat="999" lon="-122.43"/>
          <trkpt lat="37.78" lon="-122.44"/>
        </trkseg>
      </trk>`);

    const route = parseGpxRoute(xml, "mixed");
    expect(route.geometry).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { parseKmlRoute } from "../kmlParser";
import { MAX_UPLOAD_BYTES, MAX_XML_DEPTH } from "../xmlUtils";

function wrapKml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    ${body}
  </Document>
</kml>`;
}

describe("parseKmlRoute", () => {
  it("parses MultiGeometry LineStrings in document order", () => {
    const xml = wrapKml(`
      <Placemark>
        <name>Bay Path</name>
        <MultiGeometry>
          <LineString>
            <coordinates>-122.42,37.77,10 -122.421,37.771,20</coordinates>
          </LineString>
          <LineString>
            <coordinates>-122.422,37.772,30</coordinates>
          </LineString>
        </MultiGeometry>
      </Placemark>`);

    const route = parseKmlRoute(xml, "fallback");
    expect(route.name).toBe("Bay Path");
    expect(route.geometry).toHaveLength(3);
    expect(route.elevationProfile).toBeDefined();
    expect(route.elevationGainM).toBe(20);
  });

  it("does not treat missing altitude as elevation data", () => {
    const xml = wrapKml(`
      <Placemark>
        <LineString>
          <coordinates>-122.42,37.77 -122.43,37.78</coordinates>
        </LineString>
      </Placemark>`);

    const route = parseKmlRoute(xml, "fallback");
    expect(route.elevationProfile).toBeUndefined();
    expect(route.elevationGainM).toBe(0);
  });

  it("rejects polygon-only geometry with a clear error", () => {
    const xml = wrapKml(`
      <Placemark>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>-122.42,37.77 -122.43,37.77 -122.43,37.78 -122.42,37.77</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`);

    expect(() => parseKmlRoute(xml, "poly")).toThrow(/Polygon-only/i);
  });

  it("rejects invalid XML", () => {
    expect(() => parseKmlRoute("<kml><Placemark>", "bad")).toThrow(/Invalid KML/i);
  });

  it("rejects oversized content", () => {
    const huge = `<kml>${"a".repeat(MAX_UPLOAD_BYTES + 1)}</kml>`;
    expect(() => parseKmlRoute(huge, "huge")).toThrow(/too large/i);
  });

  it("rejects deeply nested XML", () => {
    const nested = `${"<a>".repeat(MAX_XML_DEPTH + 2)}x${"</a>".repeat(MAX_XML_DEPTH + 2)}`;
    expect(() => parseKmlRoute(nested, "deep")).toThrow(/too deep/i);
  });

  it("rejects antimeridian longitudes outside [-180, 180]", () => {
    const xml = wrapKml(`
      <Placemark>
        <LineString>
          <coordinates>190,10 191,11</coordinates>
        </LineString>
      </Placemark>`);

    expect(() => parseKmlRoute(xml, "anti")).toThrow(/at least two valid/i);
  });
});

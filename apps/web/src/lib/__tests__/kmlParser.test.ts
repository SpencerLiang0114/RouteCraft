import { describe, expect, it } from "vitest";
import { parseKmlRoute } from "../kmlParser";

const minimalKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Path</name>
      <LineString>
        <coordinates>
          -122.4194,37.7749,0 -122.4195,37.7750,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

const kmlWithElevation = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Elevated Path</name>
      <LineString>
        <coordinates>
          -122.4194,37.7749,10 -122.4195,37.7750,25 -122.4196,37.7751,40
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

const singleCoordKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <LineString>
        <coordinates>-122.4194,37.7749,0</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

const noLineStringKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Point only</name>
      <Point>
        <coordinates>-122.4194,37.7749,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

describe("parseKmlRoute", () => {
  it("parses a valid LineString into geometry with at least two points", () => {
    const route = parseKmlRoute(minimalKml, "Fallback");
    expect(route.geometry.length).toBeGreaterThanOrEqual(2);
    expect(route.name).toBe("Test Path");
    expect(route.elevationProfile).toBeUndefined();
  });

  it("throws on invalid XML", () => {
    expect(() => parseKmlRoute("<not-valid", "Fallback")).toThrow("Invalid KML file.");
  });

  it("throws when fewer than two coordinates", () => {
    expect(() => parseKmlRoute(singleCoordKml, "Fallback")).toThrow(
      "KML route needs at least two valid coordinates.",
    );
  });

  it("throws when no LineString is present", () => {
    expect(() => parseKmlRoute(noLineStringKml, "Fallback")).toThrow(
      "KML route needs LineString coordinates.",
    );
  });

  it("includes elevationProfile when elevation is present", () => {
    const route = parseKmlRoute(kmlWithElevation, "Fallback");
    expect(route.elevationProfile).toBeDefined();
    expect(route.elevationProfile!.length).toBe(3);
    expect(route.elevationGainM).toBe(30);
  });
});

package com.routecraft.api.routes;

import java.time.Instant;
import java.time.format.DateTimeParseException;

import tools.jackson.databind.JsonNode;

public class GpxExporter {

    public static String toGpx(JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("Route payload must be a JSON object.");
        }

        JsonNode geometry = payload.get("geometry");
        if (geometry == null || !geometry.isArray() || geometry.size() < 2) {
            throw new IllegalArgumentException("Route geometry must contain at least two points.");
        }

        String name = optionalText(payload.get("name"));
        String metadataTime = isoTime(payload.get("savedAt"));
        JsonNode elevationProfile = alignedElevationProfile(payload.get("elevationProfile"), geometry.size());

        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<gpx version=\"1.1\" creator=\"RouteCraft\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n");
        xml.append("  <metadata>\n");
        xml.append("    <name>").append(escapeXml(name)).append("</name>\n");
        if (metadataTime != null) {
            xml.append("    <time>").append(metadataTime).append("</time>\n");
        }
        xml.append("  </metadata>\n");
        xml.append("  <trk>\n");
        xml.append("    <name>").append(escapeXml(name)).append("</name>\n");
        xml.append("    <trkseg>\n");

        for (int i = 0; i < geometry.size(); i++) {
            JsonNode point = geometry.get(i);
            if (point == null || !point.isObject()) {
                throw new IllegalArgumentException("Route geometry points must be objects.");
            }

            JsonNode lat = point.get("lat");
            JsonNode lng = point.get("lng") != null ? point.get("lng") : point.get("lon");
            if (lat == null || !lat.isNumber() || lng == null || !lng.isNumber()) {
                throw new IllegalArgumentException("Route geometry points must include numeric lat and lng.");
            }

            xml.append("      <trkpt lat=\"").append(numberText(lat))
                    .append("\" lon=\"").append(numberText(lng)).append("\">");

            JsonNode elevation = elevationAt(elevationProfile, i);
            if (elevation != null) {
                xml.append("\n        <ele>").append(numberText(elevation)).append("</ele>");
            }

            String pointTime = isoTime(point.get("time"));
            if (pointTime != null) {
                xml.append("\n        <time>").append(pointTime).append("</time>");
            }

            if (elevation != null || pointTime != null) {
                xml.append("\n      </trkpt>\n");
            } else {
                xml.append("</trkpt>\n");
            }
        }

        xml.append("    </trkseg>\n");
        xml.append("  </trk>\n");
        xml.append("</gpx>\n");
        return xml.toString();
    }

    private static JsonNode alignedElevationProfile(JsonNode profile, int geometrySize) {
        if (profile == null || !profile.isArray() || profile.size() != geometrySize) {
            return null;
        }
        return profile;
    }

    private static JsonNode elevationAt(JsonNode profile, int index) {
        if (profile == null) {
            return null;
        }
        JsonNode point = profile.get(index);
        if (point == null || point.isNull()) {
            return null;
        }
        JsonNode elevation = point.isNumber() ? point : point.get("elevM");
        if (elevation == null || !elevation.isNumber()) {
            return null;
        }
        return elevation;
    }

    private static String optionalText(JsonNode value) {
        if (value == null || value.isNull()) {
            return "";
        }
        return value.asString();
    }

    private static String isoTime(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        String raw = value.asString();
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw).toString();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static String numberText(JsonNode value) {
        return value.decimalValue().stripTrailingZeros().toPlainString();
    }

    private static String escapeXml(String value) {
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}

package com.routecraft.api.routes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import tools.jackson.databind.JsonNode;

public class GpxExporter {

    private static final double EARTH_RADIUS_KM = 6371.0;

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
        List<ElevSample> elevationProfile = parseElevationProfile(payload.get("elevationProfile"));

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

        double distanceKm = 0;
        Double prevLat = null;
        Double prevLng = null;
        for (int i = 0; i < geometry.size(); i++) {
            JsonNode point = geometry.get(i);
            if (point == null || !point.isObject()) {
                throw new IllegalArgumentException("Route geometry points must be objects.");
            }

            JsonNode latNode = point.get("lat");
            JsonNode lngNode = point.get("lng") != null ? point.get("lng") : point.get("lon");
            if (latNode == null || !latNode.isNumber() || lngNode == null || !lngNode.isNumber()) {
                throw new IllegalArgumentException("Route geometry points must include numeric lat and lng.");
            }

            double lat = latNode.asDouble();
            double lng = lngNode.asDouble();
            if (prevLat != null) {
                distanceKm += haversineKm(prevLat, prevLng, lat, lng);
            }
            prevLat = lat;
            prevLng = lng;

            xml.append("      <trkpt lat=\"").append(numberText(latNode))
                    .append("\" lon=\"").append(numberText(lngNode)).append("\">");

            Double elevation = elevationAtDistance(elevationProfile, distanceKm);
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

    private static List<ElevSample> parseElevationProfile(JsonNode profile) {
        if (profile == null || !profile.isArray() || profile.isEmpty()) {
            return List.of();
        }
        List<ElevSample> samples = new ArrayList<>();
        for (JsonNode point : profile) {
            if (point == null || point.isNull() || !point.isObject()) {
                continue;
            }
            JsonNode elevation = point.get("elevM");
            JsonNode distance = point.get("distanceKm");
            if (elevation == null || !elevation.isNumber() || distance == null || !distance.isNumber()) {
                continue;
            }
            samples.add(new ElevSample(distance.asDouble(), elevation.asDouble()));
        }
        samples.sort(Comparator.comparingDouble(ElevSample::distanceKm));
        return samples;
    }

    private static Double elevationAtDistance(List<ElevSample> samples, double distanceKm) {
        if (samples.isEmpty()) {
            return null;
        }
        if (distanceKm <= samples.getFirst().distanceKm()) {
            return samples.getFirst().elevM();
        }
        for (int i = 1; i < samples.size(); i++) {
            ElevSample next = samples.get(i);
            if (distanceKm <= next.distanceKm()) {
                ElevSample prev = samples.get(i - 1);
                double span = next.distanceKm() - prev.distanceKm();
                if (span <= 0) {
                    return next.elevM();
                }
                double t = (distanceKm - prev.distanceKm()) / span;
                return prev.elevM() + t * (next.elevM() - prev.elevM());
            }
        }
        return samples.getLast().elevM();
    }

    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
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

    private static String numberText(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    private static String escapeXml(String value) {
        StringBuilder cleaned = new StringBuilder(value.length());
        value.codePoints().forEach(codePoint -> {
            if (isXmlChar(codePoint)) {
                cleaned.appendCodePoint(codePoint);
            }
        });
        return cleaned.toString()
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    private static boolean isXmlChar(int codePoint) {
        return codePoint == 0x9 || codePoint == 0xA || codePoint == 0xD
                || (codePoint >= 0x20 && codePoint <= 0xD7FF)
                || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
                || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    }

    private record ElevSample(double distanceKm, double elevM) {
    }
}

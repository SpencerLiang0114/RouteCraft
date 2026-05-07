package com.routecraft.api.routing.osm;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.model.ElevationPoint;
import com.routecraft.api.routing.model.LatLng;

@Component
public class ElevationService {

    private static final Logger log = LoggerFactory.getLogger(ElevationService.class);

    private static final String OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/elevation";
    private static final String OPEN_ELEVATION_ENDPOINT = "https://api.open-elevation.com/api/v1/lookup";
    private static final int MAX_ELEVATION_POINTS = 800;
    private static final double ROUTE_ELEV_STEP_M = 25;
    private static final int ROUTE_ELEV_MAX_POINTS = 500;

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public ElevationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    public Map<String, Double> fetchElevations(List<LatLng> points) {
        try {
            return fetchOpenMeteo(points);
        } catch (Exception ex) {
            log.debug("Open-Meteo elevation failed, falling back: {}", ex.getMessage());
            try {
                return fetchOpenElevation(points);
            } catch (Exception fallbackEx) {
                log.warn("Both elevation providers failed: {}", fallbackEx.getMessage());
                return Map.of();
            }
        }
    }

    private Map<String, Double> fetchOpenMeteo(List<LatLng> points) throws Exception {
        List<LatLng> unique = uniqueCappedPoints(points);
        Map<String, Double> result = new HashMap<>();
        for (int i = 0; i < unique.size(); i += 100) {
            List<LatLng> chunk = unique.subList(i, Math.min(unique.size(), i + 100));
            StringBuilder lats = new StringBuilder();
            StringBuilder lngs = new StringBuilder();
            for (int j = 0; j < chunk.size(); j++) {
                if (j > 0) {
                    lats.append(',');
                    lngs.append(',');
                }
                lats.append(String.format(Locale.ROOT, "%.6f", chunk.get(j).lat()));
                lngs.append(String.format(Locale.ROOT, "%.6f", chunk.get(j).lng()));
            }
            String params = "latitude=" + URLEncoder.encode(lats.toString(), StandardCharsets.UTF_8)
                    + "&longitude=" + URLEncoder.encode(lngs.toString(), StandardCharsets.UTF_8);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPEN_METEO_ENDPOINT + "?" + params))
                    .timeout(Duration.ofSeconds(8))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException("Elevation request failed with " + response.statusCode());
            }
            JsonNode body = objectMapper.readTree(response.body());
            JsonNode elevs = body.path("elevation");
            if (!elevs.isArray()) continue;
            for (int j = 0; j < chunk.size() && j < elevs.size(); j++) {
                JsonNode elev = elevs.get(j);
                if (elev.isNumber()) {
                    result.put(nodeKey(chunk.get(j)), elev.asDouble());
                }
            }
        }
        return result;
    }

    private Map<String, Double> fetchOpenElevation(List<LatLng> points) throws Exception {
        List<LatLng> unique = uniqueCappedPoints(points);
        Map<String, Double> result = new HashMap<>();
        for (int i = 0; i < unique.size(); i += 200) {
            List<LatLng> chunk = unique.subList(i, Math.min(unique.size(), i + 200));
            ObjectNode payload = objectMapper.createObjectNode();
            ArrayNode locations = payload.putArray("locations");
            for (LatLng pt : chunk) {
                ObjectNode loc = locations.addObject();
                loc.put("latitude", pt.lat());
                loc.put("longitude", pt.lng());
            }
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPEN_ELEVATION_ENDPOINT))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException("Open-Elevation request failed with " + response.statusCode());
            }
            JsonNode body = objectMapper.readTree(response.body());
            JsonNode results = body.path("results");
            if (!results.isArray()) continue;
            for (int j = 0; j < chunk.size() && j < results.size(); j++) {
                JsonNode resNode = results.get(j);
                JsonNode elev = resNode.path("elevation");
                if (elev.isNumber()) {
                    result.put(nodeKey(chunk.get(j)), elev.asDouble());
                }
            }
        }
        return result;
    }

    private static List<LatLng> uniqueCappedPoints(List<LatLng> points) {
        LinkedHashMap<String, LatLng> unique = new LinkedHashMap<>();
        for (LatLng pt : points) {
            unique.putIfAbsent(nodeKey(pt), pt);
        }
        List<LatLng> result = new ArrayList<>(unique.values());
        if (result.size() > MAX_ELEVATION_POINTS) {
            result = new ArrayList<>(result.subList(0, MAX_ELEVATION_POINTS));
        }
        return result;
    }

    public static String nodeKey(LatLng point) {
        return String.format(Locale.ROOT, "%.6f,%.6f", point.lat(), point.lng());
    }

    public RouteElevationProfile fetchRouteElevationProfile(List<LatLng> geometry) {
        if (geometry.size() < 2) {
            return null;
        }
        List<LatLng> sampled = resampleGeometry(geometry, ROUTE_ELEV_STEP_M, ROUTE_ELEV_MAX_POINTS);
        Map<String, Double> elevations = fetchElevations(sampled);
        if (elevations.isEmpty()) {
            return null;
        }
        double accDistM = 0;
        List<RawSample> samples = new ArrayList<>(sampled.size());
        for (int i = 0; i < sampled.size(); i++) {
            if (i > 0) {
                accDistM += GeoUtils.distanceM(sampled.get(i - 1), sampled.get(i));
            }
            Double elevM = elevations.get(nodeKey(sampled.get(i)));
            samples.add(new RawSample(Math.round(accDistM / 10) / 100.0, elevM));
        }
        List<ElevationPoint> profile = fillMissing(samples);
        if (profile.size() < 2) return null;
        profile = removeSpikes(profile);
        profile = smooth(profile, 4);
        profile.replaceAll(p -> new ElevationPoint(p.distanceKm(), Math.round(p.elevM() * 10) / 10.0));
        return new RouteElevationProfile(profile, computeStats(profile));
    }

    private static List<LatLng> resampleGeometry(List<LatLng> geometry, double stepM, int maxPoints) {
        if (geometry.size() < 2) return new ArrayList<>(geometry);
        double totalDistanceM = GeoUtils.calculateGeometryDistanceM(geometry);
        if (totalDistanceM <= 0) return List.of(geometry.get(0));
        int sampleCount = Math.min(maxPoints, Math.max(2, (int) Math.floor(totalDistanceM / stepM) + 1));
        double intervalM = totalDistanceM / (sampleCount - 1);
        List<LatLng> result = new ArrayList<>();
        result.add(geometry.get(0));
        double traversedM = 0;
        double nextSampleM = intervalM;
        for (int i = 1; i < geometry.size() && result.size() < sampleCount - 1; i++) {
            LatLng prev = geometry.get(i - 1);
            LatLng curr = geometry.get(i);
            double segDistM = GeoUtils.distanceM(prev, curr);
            if (segDistM <= 0) continue;
            while (nextSampleM <= traversedM + segDistM && result.size() < sampleCount - 1) {
                double t = (nextSampleM - traversedM) / segDistM;
                result.add(new LatLng(
                        prev.lat() + t * (curr.lat() - prev.lat()),
                        prev.lng() + t * (curr.lng() - prev.lng())));
                nextSampleM += intervalM;
            }
            traversedM += segDistM;
        }
        LatLng last = geometry.get(geometry.size() - 1);
        LatLng tail = result.get(result.size() - 1);
        if (tail.lat() != last.lat() || tail.lng() != last.lng()) {
            result.add(last);
        }
        return result;
    }

    private static List<ElevationPoint> fillMissing(List<RawSample> samples) {
        List<Integer> known = new ArrayList<>();
        for (int i = 0; i < samples.size(); i++) {
            if (samples.get(i).elevM != null) known.add(i);
        }
        if (known.isEmpty()) return new ArrayList<>();
        List<ElevationPoint> result = new ArrayList<>(samples.size());
        for (int i = 0; i < samples.size(); i++) {
            RawSample sample = samples.get(i);
            if (sample.elevM != null) {
                result.add(new ElevationPoint(sample.distanceKm, sample.elevM));
                continue;
            }
            int prev = -1;
            for (int j = known.size() - 1; j >= 0; j--) {
                if (known.get(j) < i) {
                    prev = known.get(j);
                    break;
                }
            }
            int next = -1;
            for (Integer k : known) {
                if (k > i) {
                    next = k;
                    break;
                }
            }
            if (prev == -1 && next == -1) {
                result.add(new ElevationPoint(sample.distanceKm, 0));
            } else if (prev == -1) {
                result.add(new ElevationPoint(sample.distanceKm, samples.get(next).elevM));
            } else if (next == -1) {
                result.add(new ElevationPoint(sample.distanceKm, samples.get(prev).elevM));
            } else {
                RawSample from = samples.get(prev);
                RawSample to = samples.get(next);
                double span = to.distanceKm - from.distanceKm;
                double t = span > 0 ? (sample.distanceKm - from.distanceKm) / span : 0;
                result.add(new ElevationPoint(sample.distanceKm, from.elevM + (to.elevM - from.elevM) * t));
            }
        }
        return result;
    }

    private static List<ElevationPoint> removeSpikes(List<ElevationPoint> profile) {
        if (profile.size() < 3) return profile;
        List<ElevationPoint> result = new ArrayList<>(profile.size());
        for (int i = 0; i < profile.size(); i++) {
            ElevationPoint point = profile.get(i);
            if (i == 0 || i == profile.size() - 1) {
                result.add(point);
                continue;
            }
            ElevationPoint prev = profile.get(i - 1);
            ElevationPoint next = profile.get(i + 1);
            double neighborGap = Math.abs(prev.elevM() - next.elevM());
            double neighborAverage = (prev.elevM() + next.elevM()) / 2;
            double spikeSize = Math.abs(point.elevM() - neighborAverage);
            if (neighborGap <= 4 && spikeSize >= 10) {
                result.add(new ElevationPoint(point.distanceKm(), neighborAverage));
            } else {
                result.add(point);
            }
        }
        return result;
    }

    private static List<ElevationPoint> smooth(List<ElevationPoint> profile, int sigma) {
        if (profile.size() <= 2) return profile;
        int radius = (int) Math.ceil(sigma * 3);
        List<ElevationPoint> result = new ArrayList<>(profile.size());
        for (int i = 0; i < profile.size(); i++) {
            double weightSum = 0;
            double elevSum = 0;
            for (int j = Math.max(0, i - radius); j <= Math.min(profile.size() - 1, i + radius); j++) {
                double w = Math.exp(-((j - i) * (j - i)) / (2.0 * sigma * sigma));
                weightSum += w;
                elevSum += w * profile.get(j).elevM();
            }
            result.add(new ElevationPoint(profile.get(i).distanceKm(),
                    Math.round((elevSum / weightSum) * 10) / 10.0));
        }
        return result;
    }

    private static ProfileStats computeStats(List<ElevationPoint> profile) {
        double lowest = Double.POSITIVE_INFINITY;
        double highest = Double.NEGATIVE_INFINITY;
        for (ElevationPoint p : profile) {
            lowest = Math.min(lowest, p.elevM());
            highest = Math.max(highest, p.elevM());
        }
        double gain = 0;
        double descent = 0;
        for (int i = 1; i < profile.size(); i++) {
            double diff = profile.get(i).elevM() - profile.get(i - 1).elevM();
            if (diff > 0) gain += diff; else descent -= diff;
        }
        return new ProfileStats(
                Math.round(gain),
                Math.round(descent),
                Math.round(lowest),
                Math.round(highest),
                Math.round(highest - lowest));
    }

    public record RouteElevationProfile(List<ElevationPoint> profile, ProfileStats stats) {
    }

    public record ProfileStats(
            double elevationGainM,
            double totalDescentM,
            double lowestElevM,
            double highestElevM,
            double elevDifferenceM) {
    }

    private record RawSample(double distanceKm, Double elevM) {
    }
}

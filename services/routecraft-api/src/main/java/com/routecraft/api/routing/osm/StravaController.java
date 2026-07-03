package com.routecraft.api.routing.osm;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.osm.StravaService.StravaExploreResult;
import com.routecraft.api.routing.osm.StravaService.StravaSegment;

@RestController
@RequestMapping("/api/strava")
@Validated
public class StravaController {

    private final StravaService stravaService;

    public StravaController(StravaService stravaService) {
        this.stravaService = stravaService;
    }

    @GetMapping("/segments")
    public ResponseEntity<StravaExploreResult> getSegments(
            @DecimalMin("-90.0") @DecimalMax("90.0")
            @RequestParam double lat,
            @DecimalMin("-180.0") @DecimalMax("180.0")
            @RequestParam double lng,
            @Pattern(regexp = "all|running|riding")
            @RequestParam String activity,
            @DecimalMin("0.1") @DecimalMax("20.0")
            @RequestParam double radiusKm,
            @Min(1) @Max(50)
            @RequestParam(defaultValue = "10") int limit) {

        LatLng center = new LatLng(lat, lng);
        
        List<Double> searchRadii = new ArrayList<>();
        searchRadii.add(Math.min(radiusKm, 1.0));
        if (radiusKm > 2.0) searchRadii.add(Math.min(radiusKm, 5.0));
        if (radiusKm > 5.0) searchRadii.add(radiusKm);

        List<StravaSegment> allSegments = new ArrayList<>();
        Set<String> seenIds = ConcurrentHashMap.newKeySet();
        String source = "mock";

        for (double r : searchRadii) {
            double[] bounds = calculateBounds(center, r);
            StravaExploreResult result = stravaService.exploreSegments(bounds, activity);
            
            if ("strava-api".equals(result.source())) {
                source = "strava-api";
            }
            
            for (StravaSegment seg : result.segments()) {
                if (seenIds.add(seg.id())) {
                    allSegments.add(seg);
                }
            }
        }

        List<StravaSegment> filtered = allSegments.stream()
                .filter(seg -> {
                    double dist = getClosestDistanceToSegment(center, seg.geometry());
                    return dist <= radiusKm;
                })
                .sorted((a, b) -> {
                    double distA = getClosestDistanceToSegment(center, a.geometry());
                    double distB = getClosestDistanceToSegment(center, b.geometry());
                    return Double.compare(distA, distB);
                })
                .limit(limit)
                .collect(Collectors.toList());

        return ResponseEntity.ok(new StravaExploreResult(source, filtered, null));
    }

    private double getClosestDistanceToSegment(LatLng point, List<LatLng> geometry) {
        if (geometry.isEmpty()) return Double.MAX_VALUE;
        if (geometry.size() == 1) return GeoUtils.haversineDistanceKm(point, geometry.get(0));

        double minDistance = Double.MAX_VALUE;
        for (int i = 0; i < geometry.size() - 1; i++) {
            double dist = GeoUtils.pointToSegmentDistanceKm(point, geometry.get(i), geometry.get(i + 1));
            if (dist < minDistance) {
                minDistance = dist;
            }
        }
        return minDistance;
    }

    private double[] calculateBounds(LatLng center, double radiusKm) {
        double latChange = radiusKm / 111.32;
        double lngChange = radiusKm / (111.32 * Math.cos(Math.toRadians(center.lat())));

        return new double[]{
                center.lat() - latChange,
                center.lng() - lngChange,
                center.lat() + latChange,
                center.lng() + lngChange
        };
    }
}

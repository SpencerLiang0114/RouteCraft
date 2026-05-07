package com.routecraft.api.routing.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record RouteCandidate(
        String id,
        RouteSource source,
        String name,
        ActivityType activity,
        RouteType routeType,
        List<LatLng> geometry,
        List<LatLng> waypoints,
        double distanceKm,
        int estimatedDurationMin,
        double elevationGainM,
        Double totalDescentM,
        Double averageSlopePct,
        Double maxSlopePct,
        Double lowestElevM,
        Double highestElevM,
        Double elevDifferenceM,
        List<ElevationPoint> elevationProfile,
        Difficulty difficulty,
        RouteMetrics metrics,
        String explanation) {
}

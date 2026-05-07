package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotNull;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserPreferences(
        @NotNull ActivityType activity,
        @NotNull RouteType routeType,
        Double targetDistanceKm,
        Double targetDurationMin,
        LatLng startPoint,
        LatLng endPoint,
        double parkPreference,
        double shadePreference,
        double elevationPreference,
        double safetyPreference,
        double explorationPreference,
        String departureTime,
        RouteStyle routeStyle) {

    public UserPreferences {
        if (departureTime == null) {
            departureTime = "";
        }
    }
}

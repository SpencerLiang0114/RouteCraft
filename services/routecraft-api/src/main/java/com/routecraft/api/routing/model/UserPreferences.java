package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserPreferences(
        @NotNull ActivityType activity,
        @NotNull RouteType routeType,
        @DecimalMin("0.1") @DecimalMax("200.0")
        Double targetDistanceKm,
        @DecimalMin("1.0") @DecimalMax("1440.0")
        Double targetDurationMin,
        LatLng startPoint,
        LatLng endPoint,
        @DecimalMin("0.0") @DecimalMax("3.0")
        double parkPreference,
        @DecimalMin("0.0") @DecimalMax("3.0")
        double shadePreference,
        @DecimalMin("0.0") @DecimalMax("3.0")
        double elevationPreference,
        @DecimalMin("0.0") @DecimalMax("3.0")
        double safetyPreference,
        @DecimalMin("0.0") @DecimalMax("3.0")
        double explorationPreference,
        @Size(max = 64)
        String departureTime,
        RouteStyle routeStyle) {

    public UserPreferences {
        if (departureTime == null) {
            departureTime = "";
        }
    }
}

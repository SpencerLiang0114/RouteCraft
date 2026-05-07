package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonIgnore;

public record LatLng(double lat, double lng) {

    @JsonIgnore
    public boolean isValid() {
        return Double.isFinite(lat) && Double.isFinite(lng)
                && lat >= -90 && lat <= 90
                && lng >= -180 && lng <= 180;
    }
}

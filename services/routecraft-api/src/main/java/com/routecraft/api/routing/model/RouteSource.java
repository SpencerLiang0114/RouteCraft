package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum RouteSource {
    GENERATED,
    STRAVA,
    UPLOADED;

    @JsonValue
    public String value() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static RouteSource from(String value) {
        if (value == null) {
            return null;
        }
        for (RouteSource source : values()) {
            if (source.value().equals(value)) {
                return source;
            }
        }
        throw new IllegalArgumentException("Unknown source: " + value);
    }
}

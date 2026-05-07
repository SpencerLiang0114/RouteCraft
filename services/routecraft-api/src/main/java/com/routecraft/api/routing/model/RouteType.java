package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum RouteType {
    LOOP,
    POINT_TO_POINT,
    OUT_AND_BACK;

    @JsonValue
    public String value() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static RouteType from(String value) {
        if (value == null) {
            throw new IllegalArgumentException("routeType is required.");
        }
        for (RouteType type : values()) {
            if (type.value().equals(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown routeType: " + value);
    }
}

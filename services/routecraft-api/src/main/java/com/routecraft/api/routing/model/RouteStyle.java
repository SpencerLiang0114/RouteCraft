package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum RouteStyle {
    EASY_FLAT,
    PARK_HEAVY,
    SHADED,
    SCENIC,
    CLIMBING,
    EXPLORATION;

    @JsonValue
    public String value() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static RouteStyle from(String value) {
        if (value == null) {
            return null;
        }
        for (RouteStyle style : values()) {
            if (style.value().equals(value)) {
                return style;
            }
        }
        throw new IllegalArgumentException("Unknown routeStyle: " + value);
    }
}

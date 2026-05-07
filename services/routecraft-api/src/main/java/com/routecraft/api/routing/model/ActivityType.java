package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ActivityType {
    RUNNING,
    HIKING,
    CYCLING;

    @JsonValue
    public String value() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static ActivityType from(String value) {
        if (value == null) {
            throw new IllegalArgumentException("activity is required.");
        }
        for (ActivityType type : values()) {
            if (type.value().equals(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown activity: " + value);
    }
}

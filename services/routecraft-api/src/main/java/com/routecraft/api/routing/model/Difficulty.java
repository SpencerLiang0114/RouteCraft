package com.routecraft.api.routing.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum Difficulty {
    EASY("Easy"),
    MODERATE("Moderate"),
    HARD("Hard");

    private final String label;

    Difficulty(String label) {
        this.label = label;
    }

    @JsonValue
    public String value() {
        return label;
    }

    @JsonCreator
    public static Difficulty from(String value) {
        if (value == null) {
            return null;
        }
        for (Difficulty difficulty : values()) {
            if (difficulty.label.equals(value)) {
                return difficulty;
            }
        }
        throw new IllegalArgumentException("Unknown difficulty: " + value);
    }
}

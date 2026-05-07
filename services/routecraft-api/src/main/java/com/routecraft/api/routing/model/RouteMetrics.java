package com.routecraft.api.routing.model;

public record RouteMetrics(
        double parkScore,
        double shadeScore,
        double safetyScore,
        double explorationScore,
        double sceneryScore,
        double elevationScore,
        double distanceScore,
        double totalScore) {
}

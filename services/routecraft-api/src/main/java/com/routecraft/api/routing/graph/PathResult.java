package com.routecraft.api.routing.graph;

import java.util.List;

import com.routecraft.api.routing.model.LatLng;

public record PathResult(
        List<String> nodeIds,
        List<RouteEdge> edges,
        List<LatLng> geometry,
        double distanceM,
        double cost) {
}

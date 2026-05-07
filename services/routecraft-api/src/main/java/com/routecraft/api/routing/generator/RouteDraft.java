package com.routecraft.api.routing.generator;

import java.util.List;
import java.util.Set;

import com.routecraft.api.routing.graph.PathResult;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteType;

public record RouteDraft(
        String id,
        String name,
        ActivityType activity,
        RouteType routeType,
        PathResult path,
        List<LatLng> waypoints,
        RouteStrategy strategy,
        Set<String> referenceEdgeIds) {

    public RouteDraft {
        waypoints = waypoints == null ? null : List.copyOf(waypoints);
    }
}

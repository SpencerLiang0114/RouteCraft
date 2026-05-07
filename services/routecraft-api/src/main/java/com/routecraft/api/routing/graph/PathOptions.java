package com.routecraft.api.routing.graph;

import java.util.Map;
import java.util.Set;

public record PathOptions(
        Set<String> blockedEdgeIds,
        Set<String> blockedNodeIds,
        Map<String, Double> edgePenalties) {

    public static final PathOptions EMPTY = new PathOptions(null, null, null);

    public static PathOptions empty() {
        return EMPTY;
    }
}

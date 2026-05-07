package com.routecraft.api.routing.generator;

import java.util.List;

import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.model.RouteCandidate;

/**
 * Internal candidate that wraps a public RouteCandidate plus edge metadata
 * used for diversity filtering and overlap calculations.
 */
public record GeneratedRouteCandidate(
        RouteCandidate candidate,
        List<String> edgeIds,
        List<RouteEdge> edges,
        RouteStrategy strategy) {

    public GeneratedRouteCandidate {
        edgeIds = List.copyOf(edgeIds);
        edges = List.copyOf(edges);
    }

    public GeneratedRouteCandidate withCandidate(RouteCandidate replacement) {
        return new GeneratedRouteCandidate(replacement, edgeIds, edges, strategy);
    }
}

package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.PathResult;
import com.routecraft.api.routing.graph.Pathfinding;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.graph.RouteNode;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.UserPreferences;

public final class OutAndBackGenerator {

    private OutAndBackGenerator() {
    }

    public static List<GeneratedRouteCandidate> generate(UserPreferences preferences, RouteGraph graph) {
        RouteNode startNode = CandidateSelector.getStartNode(graph, preferences);
        double targetDistanceM = GeoUtils.resolveTargetDistanceKm(preferences) * 1000;
        Pathfinding.ShortestPathTree searchTree =
                Pathfinding.buildShortestPathTree(graph, startNode.id(), preferences);
        List<RouteNode> destinations = CandidateSelector.findOutAndBackDestinations(
                preferences, graph, startNode, searchTree.pathDistancesM());

        record Outbound(PathResult outbound, RouteNode destination, double reverseError) {}
        List<Outbound> built = new ArrayList<>();
        for (RouteNode destination : destinations) {
            Optional<PathResult> outbound = searchTree.pathTo(graph, destination.id());
            if (outbound.isEmpty()) continue;
            double err = Math.abs(outbound.get().distanceM() * 2 - targetDistanceM);
            built.add(new Outbound(outbound.get(), destination, err));
        }
        built.sort(Comparator.comparingDouble(Outbound::reverseError));

        List<GeneratedRouteCandidate> result = new ArrayList<>();
        for (int i = 0; i < built.size(); i++) {
            Outbound entry = built.get(i);
            PathResult path = Pathfinding.combinePaths(graph, List.of(entry.outbound, Pathfinding.reversePath(entry.outbound)));
            RouteDraft draft = new RouteDraft(
                    "generated-out-back-" + (i + 1),
                    "Out and Back",
                    preferences.activity(),
                    RouteType.OUT_AND_BACK,
                    path,
                    List.of(entry.destination.point()),
                    RouteStrategy.RECOMMENDED,
                    null);
            result.add(RouteAnalyzer.buildRouteCandidate(draft, preferences));
        }
        return result;
    }
}

package com.routecraft.api.routing.graph;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.routecraft.api.routing.generator.MockGraph;
import com.routecraft.api.routing.generator.OutAndBackGenerator;
import com.routecraft.api.routing.generator.GeneratedRouteCandidate;
import com.routecraft.api.routing.generator.CandidateSelector;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteStyle;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.UserPreferences;

class PathfindingOptimizationTest {

    private static final LatLng START = new LatLng(40.0149, -105.2705);

    @Test
    void shortestPathTreeMatchesIndependentAStar() {
        UserPreferences preferences = preferences(RouteType.LOOP, 5.0);
        RouteGraph graph = MockGraph.load(START, preferences);
        String destination = "r2-90";

        PathResult independent = Pathfinding.findShortestPath(
                graph, "center", destination, preferences).orElseThrow();
        Pathfinding.ShortestPathTree tree = Pathfinding.buildShortestPathTree(
                graph, "center", preferences);
        PathResult fromTree = tree.pathTo(graph, destination).orElseThrow();

        assertEquals(independent.cost(), fromTree.cost(), 1e-6);
        assertEquals(independent.distanceM(), fromTree.distanceM(), 1e-6);
        assertEquals(independent.nodeIds(), fromTree.nodeIds());
        assertEquals(fromTree.distanceM(), tree.pathDistancesM().get(destination), 1e-6);
    }

    @Test
    void diversePathsAreBoundedUniqueAndStartAtShortestPath() {
        UserPreferences preferences = preferences(RouteType.POINT_TO_POINT, 5.0);
        RouteGraph graph = MockGraph.load(START, preferences);
        String destination = "r2-90";

        List<PathResult> paths = Pathfinding.findDiversePaths(
                graph, "center", destination, preferences, 4);
        PathResult shortest = Pathfinding.findShortestPath(
                graph, "center", destination, preferences).orElseThrow();

        assertFalse(paths.isEmpty());
        assertTrue(paths.size() <= 4);
        assertEquals(shortest.nodeIds(), paths.get(0).nodeIds());

        Set<String> signatures = paths.stream()
                .map(path -> path.edges().stream()
                        .map(RouteEdge::undirectedKey)
                        .collect(Collectors.joining("|")))
                .collect(Collectors.toCollection(HashSet::new));
        assertEquals(paths.size(), signatures.size());
        for (PathResult path : paths) {
            assertEquals("center", path.nodeIds().get(0));
            assertEquals(destination, path.nodeIds().get(path.nodeIds().size() - 1));
        }
    }

    @Test
    void outAndBackCandidatesRemainClosed() {
        UserPreferences preferences = preferences(RouteType.OUT_AND_BACK, 5.0);
        RouteGraph graph = MockGraph.load(START, preferences);

        List<GeneratedRouteCandidate> candidates = OutAndBackGenerator.generate(preferences, graph);

        assertFalse(candidates.isEmpty());
        for (GeneratedRouteCandidate candidate : candidates) {
            List<LatLng> geometry = candidate.candidate().geometry();
            assertFalse(geometry.isEmpty());
            assertTrue(GeoUtils.distanceM(geometry.get(0), geometry.get(geometry.size() - 1)) < 1.0);
        }
    }

    @Test
    void loopWaypointSetsAreTieredAndBounded() {
        UserPreferences preferences = preferences(RouteType.LOOP, 10.0);
        RouteGraph graph = MockGraph.load(START, preferences);
        RouteNode startNode = CandidateSelector.getStartNode(graph, preferences);

        List<CandidateSelector.WaypointSet> sets = CandidateSelector.generateLoopWaypointSets(
                preferences, graph, startNode);

        assertFalse(sets.isEmpty());
        assertTrue(sets.size() <= 208);
        for (int i = 1; i < sets.size(); i++) {
            assertTrue(sets.get(i - 1).tier() <= sets.get(i).tier());
        }
    }

    @Test
    void edgeUndirectedKeyIsStable() {
        RouteEdge edge = RouteEdge.builder()
                .id("edge")
                .from("a")
                .to("b")
                .distanceM(10)
                .build();

        assertEquals("a<>b", edge.undirectedKey());
        assertSame(edge.undirectedKey(), edge.undirectedKey());
    }

    private static UserPreferences preferences(RouteType routeType, double targetDistanceKm) {
        return new UserPreferences(
                ActivityType.RUNNING,
                routeType,
                targetDistanceKm,
                null,
                START,
                null,
                1,
                1,
                1,
                1,
                1,
                "",
                RouteStyle.SCENIC);
    }
}

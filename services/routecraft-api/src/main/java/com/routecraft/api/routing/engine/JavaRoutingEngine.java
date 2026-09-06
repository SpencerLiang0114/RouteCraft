package com.routecraft.api.routing.engine;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.routecraft.api.routing.generator.CandidateSelector;
import com.routecraft.api.routing.generator.GeneratedRouteCandidate;
import com.routecraft.api.routing.generator.LoopGenerator;
import com.routecraft.api.routing.generator.OutAndBackGenerator;
import com.routecraft.api.routing.generator.PointToPointGenerator;
import com.routecraft.api.routing.generator.RouteAnalyzer;
import com.routecraft.api.routing.generator.RouteDiversity;
import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.UserPreferences;
import com.routecraft.api.routing.osm.OsmElement;
import com.routecraft.api.routing.osm.OsmGraphBuilder;

@Component
public class JavaRoutingEngine implements RoutingEngine {
    public static final String INSUFFICIENT_DATA = "OSM returned too little routable graph data near the selected start point.";
    public static final String NO_ROUTE = "No road-following routes matched the selected preferences near this start point.";

    @Override
    public PreparedGraph prepare(List<OsmElement> elements, UserPreferences preferences) {
        LatLng start = preferences.startPoint() != null ? preferences.startPoint() : CandidateSelector.FALLBACK_START;
        try (var stage = RoutingTimings.stage("graph_construction", "java", preferences)) {
            var raw = OsmGraphBuilder.createEdges(elements, OsmGraphBuilder.getGreenFeatures(elements), Map.of(), preferences);
            var trimmed = OsmGraphBuilder.trimToLocalGraph(start, raw.nodes(), raw.edges(), preferences);
            stage.graph(trimmed.nodes().size(), trimmed.edges().size());
            return new JavaPrepared(trimmed, start, preferences);
        }
    }

    private record JavaPrepared(OsmGraphBuilder.GraphDraft draft, LatLng start, UserPreferences preferences) implements PreparedGraph {
        @Override public List<LatLng> nodePoints() {
            return draft.nodes().stream().map(n -> n.point()).toList();
        }
        @Override public List<RouteCandidate> generate(Map<String, Double> elevations) {
            RouteGraph graph;
            try (var stage = RoutingTimings.stage("graph_finalize", "java", preferences)) {
                var edges = OsmGraphBuilder.applyElevationsToEdges(draft.edges(), elevations);
                var withStart = OsmGraphBuilder.addAnchorNode("user-start", start, draft.nodes(), edges);
                var withEnd = OsmGraphBuilder.addAnchorNode("user-end", preferences.endPoint(), withStart.nodes(), withStart.edges());
                if (withEnd.nodes().size() < 8 || withEnd.edges().size() < 8) throw new IllegalStateException(INSUFFICIENT_DATA);
                graph = new RouteGraph(withEnd.nodes(), RouteGraph.bidirectional(withEnd.edges()));
                stage.graph(graph.nodes().size(), graph.edges().size());
            }
            try (var stage = RoutingTimings.stage("candidate_generation_selection", "java", preferences)) {
                return selectTopRoutes(preferences, graph);
            }
        }
        @Override public void close() { }
    }

    public static List<RouteCandidate> selectTopRoutes(UserPreferences preferences, RouteGraph graph) {
        List<GeneratedRouteCandidate> rawCandidates = generateForRouteType(preferences, graph);
        Double targetDistanceKm = GeoUtils.resolveTargetDistanceKm(preferences);
        List<GeneratedRouteCandidate> distanceFiltered = CandidateSelector.filterGeneratedByDistance(rawCandidates, targetDistanceKm);

        List<GeneratedRouteCandidate> pool;
        if (distanceFiltered.size() >= 3) {
            pool = distanceFiltered;
        } else {
            List<GeneratedRouteCandidate> merged = new ArrayList<>(distanceFiltered);
            List<GeneratedRouteCandidate> byMiss = new ArrayList<>(rawCandidates);
            byMiss.sort((a, b) -> {
                double aMiss = Math.abs(a.candidate().distanceKm() - targetDistanceKm);
                double bMiss = Math.abs(b.candidate().distanceKm() - targetDistanceKm);
                return Double.compare(aMiss, bMiss);
            });
            merged.addAll(byMiss);
            Set<String> seen = new HashSet<>();
            List<GeneratedRouteCandidate> deduped = new ArrayList<>();
            for (GeneratedRouteCandidate c : merged) {
                if (seen.add(c.candidate().id())) deduped.add(c);
            }
            if (deduped.size() > 8) {
                deduped = deduped.subList(0, 8);
            }
            pool = deduped;
        }

        List<GeneratedRouteCandidate> ranked = CandidateSelector.rankRoutes(pool);
        // Centroid threshold: routes whose centroids are within 10 % of the target distance
        // are treated as spatial duplicates regardless of edge-ID overlap.
        double centroidThresholdKm = targetDistanceKm * 0.10;
        List<GeneratedRouteCandidate> diverse = RouteDiversity.filterDiverseRoutes(
                ranked, 0.65, centroidThresholdKm, 3);
        if (diverse.size() < 3) {
            diverse = RouteDiversity.filterDiverseRoutes(
                    ranked, 0.85, centroidThresholdKm, 3);
        }

        List<GeneratedRouteCandidate> labeled = RouteAnalyzer.sortByTotalScoreDescending(diverse);
        if (labeled.size() > 3) {
            labeled = labeled.subList(0, 3);
        }
        List<RouteCandidate> result = new ArrayList<>(labeled.size());
        for (GeneratedRouteCandidate c : labeled) {
            result.add(c.candidate());
        }
        return result;
    }

    private static List<GeneratedRouteCandidate> generateForRouteType(UserPreferences preferences, RouteGraph graph) {
        if (preferences.routeType() == RouteType.LOOP) {
            return LoopGenerator.generate(preferences, graph);
        }
        if (preferences.routeType() == RouteType.OUT_AND_BACK) {
            return OutAndBackGenerator.generate(preferences, graph);
        }
        if (preferences.routeType() == RouteType.POINT_TO_POINT) {
            return PointToPointGenerator.generate(preferences, graph);
        }
        return List.of();
    }

}

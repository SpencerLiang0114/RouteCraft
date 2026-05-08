package com.routecraft.api.routing;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.routecraft.api.routing.generator.CandidateSelector;
import com.routecraft.api.routing.generator.GeneratedRouteCandidate;
import com.routecraft.api.routing.generator.LoopGenerator;
import com.routecraft.api.routing.generator.MockGraph;
import com.routecraft.api.routing.generator.OutAndBackGenerator;
import com.routecraft.api.routing.generator.PointToPointGenerator;
import com.routecraft.api.routing.generator.RouteAnalyzer;
import com.routecraft.api.routing.generator.RouteDiversity;
import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.model.ElevationPoint;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.UserPreferences;
import com.routecraft.api.routing.osm.ElevationService;
import com.routecraft.api.routing.osm.OsmGraphLoader;

@Service
public class RouteGenerationService {

    private static final Logger log = LoggerFactory.getLogger(RouteGenerationService.class);

    private final OsmGraphLoader osmGraphLoader;
    private final ElevationService elevationService;

    public RouteGenerationService(OsmGraphLoader osmGraphLoader, ElevationService elevationService) {
        this.osmGraphLoader = osmGraphLoader;
        this.elevationService = elevationService;
    }

    public List<RouteCandidate> generate(UserPreferences preferences) {
        LatLng startPoint = preferences.startPoint() != null ? preferences.startPoint() : CandidateSelector.FALLBACK_START;
        try {
            RouteGraph graph = osmGraphLoader.load(startPoint, preferences);
            List<RouteCandidate> candidates = selectTopRoutes(preferences, graph);
            if (!candidates.isEmpty()) {
                return enrichRoutesWithElevation(candidates);
            }
            throw new IllegalStateException(
                    "No road-following routes matched the selected preferences near this start point.");
        } catch (IllegalStateException error) {
            throw error;
        } catch (Exception error) {
            log.warn("Road-following route generation failed; using mock graph fallback: {}", error.getMessage());
        }

        try {
            RouteGraph mockGraph = MockGraph.load(startPoint, preferences);
            return selectTopRoutes(preferences, mockGraph);
        } catch (Exception ignored) {
            throw new IllegalStateException(
                    "Could not load enough mapped road/path data near the selected start point. "
                            + "Retry or choose a point closer to a mapped road or path.");
        }
    }

    private List<RouteCandidate> selectTopRoutes(UserPreferences preferences, RouteGraph graph) {
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
        List<GeneratedRouteCandidate> diverse = RouteDiversity.filterDiverseRoutes(ranked, 0.65, centroidThresholdKm);
        if (diverse.size() < 3) {
            diverse = RouteDiversity.filterDiverseRoutes(ranked, 0.85, centroidThresholdKm);
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

    private List<GeneratedRouteCandidate> generateForRouteType(UserPreferences preferences, RouteGraph graph) {
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

    private List<RouteCandidate> enrichRoutesWithElevation(List<RouteCandidate> routes) {
        List<RouteCandidate> result = new ArrayList<>(routes.size());
        for (RouteCandidate route : routes) {
            ElevationService.RouteElevationProfile profile;
            try {
                profile = elevationService.fetchRouteElevationProfile(route.geometry());
            } catch (Exception ex) {
                profile = null;
            }
            if (profile == null) {
                result.add(route);
                continue;
            }
            List<ElevationPoint> scaled = scaleElevationProfileDistance(profile.profile(), route.distanceKm());
            double averageSlopePct = route.distanceKm() > 0
                    ? Math.round((profile.stats().elevationGainM() / (route.distanceKm() * 1000.0)) * 1000.0) / 10.0
                    : (route.averageSlopePct() == null ? 0 : route.averageSlopePct());
            result.add(new RouteCandidate(
                    route.id(),
                    route.source(),
                    route.name(),
                    route.activity(),
                    route.routeType(),
                    route.geometry(),
                    route.waypoints(),
                    route.distanceKm(),
                    route.estimatedDurationMin(),
                    profile.stats().elevationGainM(),
                    profile.stats().totalDescentM(),
                    averageSlopePct,
                    route.maxSlopePct(),
                    profile.stats().lowestElevM(),
                    profile.stats().highestElevM(),
                    profile.stats().elevDifferenceM(),
                    scaled,
                    route.difficulty(),
                    route.metrics(),
                    route.explanation()));
        }
        return result;
    }

    private static List<ElevationPoint> scaleElevationProfileDistance(List<ElevationPoint> profile, double distanceKm) {
        if (profile.isEmpty()) return profile;
        double profileDistanceKm = profile.get(profile.size() - 1).distanceKm();
        if (profileDistanceKm <= 0 || distanceKm <= 0) return profile;
        double scale = distanceKm / profileDistanceKm;
        List<ElevationPoint> scaled = new ArrayList<>(profile.size());
        for (ElevationPoint pt : profile) {
            scaled.add(new ElevationPoint(Math.round(pt.distanceKm() * scale * 100) / 100.0, pt.elevM()));
        }
        return scaled;
    }
}

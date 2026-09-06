package com.routecraft.api.routing;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.routecraft.api.routing.engine.EngineUnavailableException;
import com.routecraft.api.routing.engine.JavaRoutingEngine;
import com.routecraft.api.routing.engine.RoutingTimings;
import com.routecraft.api.routing.engine.RustRoutingEngine;
import com.routecraft.api.routing.generator.CandidateSelector;
import com.routecraft.api.routing.generator.MockGraph;
import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.model.ElevationPoint;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.UserPreferences;
import com.routecraft.api.routing.osm.ElevationService;
import com.routecraft.api.routing.osm.OsmGraphLoader;

@Service
public class RouteGenerationService {

    private static final Logger log = LoggerFactory.getLogger(RouteGenerationService.class);

    private final OsmGraphLoader osmGraphLoader;
    private final ElevationService elevationService;
    private final JavaRoutingEngine javaEngine;
    private final RustRoutingEngine rustEngine;
    private final String engineMode;

    public RouteGenerationService(OsmGraphLoader osmGraphLoader, ElevationService elevationService, JavaRoutingEngine javaEngine,
                                  RustRoutingEngine rustEngine, @Value("${routecraft.routing.engine:rust}") String engineMode) {
        this.osmGraphLoader = osmGraphLoader;
        this.elevationService = elevationService;
        this.javaEngine = javaEngine;
        this.rustEngine = rustEngine;
        if (!engineMode.equals("java") && !engineMode.equals("rust")) throw new IllegalArgumentException("Routing engine must be java or rust");
        this.engineMode = engineMode;
    }

    public List<RouteCandidate> generate(UserPreferences preferences) {
        LatLng startPoint = preferences.startPoint() != null ? preferences.startPoint() : CandidateSelector.FALLBACK_START;
        try {
            var elements = osmGraphLoader.acquire(startPoint, preferences);
            List<RouteCandidate> candidates;
            Map<String, Double> elevations = null;
            try (var prepared = (engineMode.equals("rust") ? rustEngine : javaEngine).prepare(elements, preferences)) {
                elevations = fetchNodeElevations(prepared.nodePoints(), startPoint, preferences);
                candidates = prepared.generate(elevations);
            } catch (EngineUnavailableException failure) {
                if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("Route generation was cancelled.");
                log.warn("routing_engine_fallback from=rust to=java reason={}", failure.getMessage());
                try (var prepared = javaEngine.prepare(elements, preferences)) {
                    if (elevations == null) elevations = fetchNodeElevations(prepared.nodePoints(), startPoint, preferences);
                    candidates = prepared.generate(elevations);
                } catch (IllegalStateException ex) { throw ex; }
                catch (Exception ex) { throw new IllegalStateException(JavaRoutingEngine.INSUFFICIENT_DATA); }
            }
            if (!candidates.isEmpty()) {
                try (var stage = RoutingTimings.stage("route_elevation", "spring", preferences)) {
                    return enrichRoutesWithElevation(candidates);
                }
            }
            throw new IllegalStateException(
                    "No road-following routes matched the selected preferences near this start point.");
        } catch (IllegalStateException error) {
            throw error;
        } catch (Exception error) {
            log.warn("Road-following route generation failed; using mock graph fallback");
        }

        try {
            RouteGraph mockGraph = MockGraph.load(startPoint, preferences);
            return JavaRoutingEngine.selectTopRoutes(preferences, mockGraph);
        } catch (Exception ignored) {
            throw new IllegalStateException(
                    "Could not load enough mapped road/path data near the selected start point. "
                            + "Retry or choose a point closer to a mapped road or path.");
        }
    }

    private Map<String, Double> fetchNodeElevations(List<LatLng> points, LatLng start, UserPreferences preferences) {
        try (var stage = RoutingTimings.stage("node_elevation", "spring", preferences)) {
            var sorted = new ArrayList<>(points);
            sorted.sort(Comparator.comparingDouble(p -> GeoUtils.distanceM(start, p)));
            return elevationService.fetchElevations(sorted);
        } catch (Exception ex) {
            log.warn("Continuing without live node elevation data");
            return Map.of();
        }
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

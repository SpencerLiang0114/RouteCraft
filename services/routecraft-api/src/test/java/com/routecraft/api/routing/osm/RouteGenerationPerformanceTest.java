package com.routecraft.api.routing.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import com.routecraft.api.routing.RouteGenerationService;
import com.routecraft.api.routing.generator.MockGraph;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.ElevationPoint;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.RouteStyle;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.UserPreferences;

class RouteGenerationPerformanceTest {

    private static final LatLng START = new LatLng(40.0149, -105.2705);

    @Test
    void enrichesFinalRoutesConcurrentlyWhilePreservingResults() {
        UserPreferences preferences = new UserPreferences(
                ActivityType.RUNNING,
                RouteType.OUT_AND_BACK,
                5.0,
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
        RouteGraph graph = MockGraph.load(START, preferences);
        ConcurrentElevationService elevationService = new ConcurrentElevationService();
        OsmGraphLoader graphLoader = new OsmGraphLoader(null, elevationService, null, new ObjectMapper()) {
            @Override
            public RouteGraph load(LatLng startPoint, UserPreferences ignored) {
                return graph;
            }
        };

        List<RouteCandidate> routes = new RouteGenerationService(graphLoader, elevationService)
                .generate(preferences);

        assertEquals(3, routes.size());
        assertTrue(elevationService.firstLookupObservedAnotherLookup(),
                "final route elevation lookups should overlap");
        assertTrue(routes.stream().allMatch(route -> route.elevationGainM() == 120));
    }

    private static final class ConcurrentElevationService extends ElevationService {
        private final CountDownLatch firstTwoLookups = new CountDownLatch(2);
        private final AtomicInteger callCount = new AtomicInteger();
        private final AtomicBoolean firstLookupObservedAnotherLookup = new AtomicBoolean();

        private ConcurrentElevationService() {
            super(new ObjectMapper(), HttpClient.newHttpClient(), "http://unused", "http://unused",
                    Duration.ofSeconds(1));
        }

        @Override
        public RouteElevationProfile fetchRouteElevationProfile(List<LatLng> geometry) {
            int call = callCount.incrementAndGet();
            firstTwoLookups.countDown();
            if (call == 1) {
                try {
                    firstLookupObservedAnotherLookup.set(firstTwoLookups.await(1, TimeUnit.SECONDS));
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            return new RouteElevationProfile(
                    List.of(new ElevationPoint(0, 100), new ElevationPoint(1, 120)),
                    new ProfileStats(120, 80, 100, 220, 120));
        }

        private boolean firstLookupObservedAnotherLookup() {
            return firstLookupObservedAnotherLookup.get();
        }
    }
}

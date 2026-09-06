package com.routecraft.api.routing.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import com.routecraft.api.routing.RouteGenerationService;
import com.routecraft.api.routing.engine.*;
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
    void enrichesFinalRoutesSequentiallyWhilePreservingResults() {
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
        RecordingElevationService elevationService = new RecordingElevationService();
        OsmGraphLoader graphLoader = mock(OsmGraphLoader.class);
        JavaRoutingEngine engine = mock(JavaRoutingEngine.class);
        RoutingEngine.PreparedGraph prepared = mock(RoutingEngine.PreparedGraph.class);
        when(graphLoader.acquire(START, preferences)).thenReturn(List.of());
        when(engine.prepare(List.of(), preferences)).thenReturn(prepared);
        when(prepared.nodePoints()).thenReturn(List.of());
        when(prepared.generate(any())).thenReturn(JavaRoutingEngine.selectTopRoutes(preferences, graph));
        List<RouteCandidate> routes = new RouteGenerationService(graphLoader, elevationService,
                engine, mock(RustRoutingEngine.class), "java").generate(preferences);

        assertEquals(3, routes.size());
        assertEquals(3, elevationService.callCount.get());
        assertTrue(elevationService.sameRequestThread.get(), "final enrichment stays on the request thread");
        verify(prepared).close();
        assertTrue(routes.stream().allMatch(route -> route.elevationGainM() == 120));
    }

    private static final class RecordingElevationService extends ElevationService {
        private final Thread requestThread = Thread.currentThread();
        private final AtomicInteger callCount = new AtomicInteger();
        private final AtomicBoolean sameRequestThread = new AtomicBoolean(true);

        private RecordingElevationService() {
            super(new ObjectMapper(), HttpClient.newHttpClient(), "http://unused", "http://unused",
                    Duration.ofSeconds(1));
        }

        @Override
        public RouteElevationProfile fetchRouteElevationProfile(List<LatLng> geometry) {
            callCount.incrementAndGet();
            if (Thread.currentThread() != requestThread) sameRequestThread.set(false);
            return new RouteElevationProfile(
                    List.of(new ElevationPoint(0, 100), new ElevationPoint(1, 120)),
                    new ProfileStats(120, 80, 100, 220, 120));
        }

    }
}

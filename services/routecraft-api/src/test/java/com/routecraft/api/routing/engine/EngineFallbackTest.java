package com.routecraft.api.routing.engine;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.routecraft.api.routing.*;
import com.routecraft.api.routing.model.*;
import com.routecraft.api.routing.osm.*;
import com.routecraft.api.routes.GeneratedRouteBatchRepository;

class EngineFallbackTest {
    static UserPreferences preferences() { return new UserPreferences(ActivityType.RUNNING, RouteType.LOOP, 2.0, null,
            new LatLng(40, -74), null, 0, 0, 0, 0, 0, "", null); }
    static RouteCandidate candidate() { return new RouteCandidate("generated-loop-1", RouteSource.GENERATED, "City Loop",
            ActivityType.RUNNING, RouteType.LOOP, List.of(new LatLng(40,-74)), List.of(), 2, 11, 0,
            null,null,null,null,null,null,null,Difficulty.EASY,new RouteMetrics(50,50,50,50,50,50,100,60),"Test."); }
    @Test void generationFailureReusesInputsClosesBothHandlesAndWritesOneBatch() {
        var osm = mock(OsmGraphLoader.class); var elevation = mock(ElevationService.class);
        var java = mock(JavaRoutingEngine.class); var rust = mock(RustRoutingEngine.class);
        var rp = mock(RoutingEngine.PreparedGraph.class); var jp = mock(RoutingEngine.PreparedGraph.class);
        var prefs = preferences(); List<OsmElement> elements = List.of(new OsmElement("way", 1, null, null, null));
        var points = List.of(new LatLng(40,-74)); var heights = Map.of("40.000000,-74.000000", 100.0);
        when(osm.acquire(prefs.startPoint(),prefs)).thenReturn(elements);
        when(rust.prepare(elements,prefs)).thenReturn(rp); when(rp.nodePoints()).thenReturn(points);
        when(elevation.fetchElevations(points)).thenReturn(heights);
        when(rp.generate(heights)).thenThrow(new EngineUnavailableException("timeout"));
        when(java.prepare(elements,prefs)).thenReturn(jp); when(jp.generate(heights)).thenReturn(List.of(candidate()));
        var service = new RouteGenerationService(osm,elevation,java,rust,"rust");
        var batches = mock(GeneratedRouteBatchRepository.class);
        var controller = new RoutingController(service,batches);
        assertEquals(1,controller.generate(prefs).routes().size());
        verify(osm,times(1)).acquire(prefs.startPoint(),prefs); verify(elevation,times(1)).fetchElevations(points);
        verify(rp).close(); verify(jp).close(); verify(jp,never()).nodePoints();
        verify(batches,times(1)).saveTypedBatch(eq(prefs),anyList()); verify(rust,times(1)).prepare(elements,prefs);
    }
    @Test void prepareFailureUsesJavaOnceButDomainFailureDoesNotFallback() {
        for (boolean domain : List.of(false,true)) {
            var osm=mock(OsmGraphLoader.class);var elevation=mock(ElevationService.class);var java=mock(JavaRoutingEngine.class);var rust=mock(RustRoutingEngine.class);
            var prefs=preferences();List<OsmElement> elements=List.of();when(osm.acquire(prefs.startPoint(),prefs)).thenReturn(elements);
            if (domain) when(rust.prepare(elements,prefs)).thenThrow(new IllegalStateException(JavaRoutingEngine.INSUFFICIENT_DATA));
            else when(rust.prepare(elements,prefs)).thenThrow(new EngineUnavailableException("overload"));
            var prepared=mock(RoutingEngine.PreparedGraph.class);when(java.prepare(elements,prefs)).thenReturn(prepared);when(prepared.nodePoints()).thenReturn(List.of());when(elevation.fetchElevations(List.of())).thenReturn(Map.of());when(prepared.generate(Map.of())).thenReturn(List.of(candidate()));
            var service=new RouteGenerationService(osm,elevation,java,rust,"rust");
            if(domain){assertThrows(IllegalStateException.class,()->service.generate(prefs));verifyNoInteractions(java,elevation);}
            else{assertEquals(1,service.generate(prefs).size());verify(java,times(1)).prepare(elements,prefs);verify(prepared).close();}
        }
    }
    @Test void failedJavaRollbackCannotProduceSyntheticRoutes() {
        var osm=mock(OsmGraphLoader.class);var elevation=mock(ElevationService.class);var java=mock(JavaRoutingEngine.class);var rust=mock(RustRoutingEngine.class);var prefs=preferences();
        when(osm.acquire(any(),any())).thenReturn(List.of());when(rust.prepare(any(),any())).thenThrow(new EngineUnavailableException("transport_failure"));when(java.prepare(any(),any())).thenThrow(new RuntimeException("broken"));
        var service=new RouteGenerationService(osm,elevation,java,rust,"rust");assertThrows(IllegalStateException.class,()->service.generate(prefs));verify(java,times(1)).prepare(any(),any());
    }
    @Test void javaModeDoesNotContactRust() {
        var osm=mock(OsmGraphLoader.class);var elevation=mock(ElevationService.class);var java=mock(JavaRoutingEngine.class);var rust=mock(RustRoutingEngine.class);var prepared=mock(RoutingEngine.PreparedGraph.class);var prefs=preferences();
        when(osm.acquire(any(),any())).thenReturn(List.of());when(java.prepare(any(),any())).thenReturn(prepared);when(prepared.nodePoints()).thenReturn(List.of());when(elevation.fetchElevations(any())).thenReturn(Map.of());when(prepared.generate(any())).thenReturn(List.of(candidate()));
        assertEquals(1,new RouteGenerationService(osm,elevation,java,rust,"java").generate(prefs).size());verifyNoInteractions(rust);
    }
    @Test void cancellationDoesNotStartJavaRollback() {
        var osm=mock(OsmGraphLoader.class);var elevation=mock(ElevationService.class);var java=mock(JavaRoutingEngine.class);var rust=mock(RustRoutingEngine.class);
        when(osm.acquire(any(),any())).thenReturn(List.of());
        when(rust.prepare(any(),any())).thenAnswer(call->{Thread.currentThread().interrupt();throw new EngineUnavailableException("interrupted");});
        try {
            assertThrows(IllegalStateException.class,()->new RouteGenerationService(osm,elevation,java,rust,"rust").generate(preferences()));
            verifyNoInteractions(java,elevation);
            assertTrue(Thread.currentThread().isInterrupted());
        } finally { Thread.interrupted(); }
    }

}

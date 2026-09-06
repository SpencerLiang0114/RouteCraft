package com.routecraft.api.routing.engine;

import java.util.List;
import java.util.Map;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.UserPreferences;
import com.routecraft.api.routing.osm.OsmElement;

/** CPU-only boundary. Provider calls and persistence belong to Spring orchestration. */
public interface RoutingEngine {
    PreparedGraph prepare(List<OsmElement> elements, UserPreferences preferences);

    interface PreparedGraph extends AutoCloseable {
        List<LatLng> nodePoints();
        List<RouteCandidate> generate(Map<String, Double> elevations);
        @Override void close();
    }
}

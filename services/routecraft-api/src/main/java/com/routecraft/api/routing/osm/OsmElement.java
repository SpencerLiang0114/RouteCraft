package com.routecraft.api.routing.osm;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.routecraft.api.routing.model.LatLng;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record OsmElement(
        String type,
        long id,
        List<Long> nodes,
        List<LatLng> geometry,
        Map<String, String> tags) {

    public Map<String, String> tagsOrEmpty() {
        return tags == null ? Map.of() : tags;
    }

    public List<LatLng> geometryOrEmpty() {
        return geometry == null ? List.of() : geometry;
    }

    public List<Long> nodesOrEmpty() {
        return nodes == null ? List.of() : nodes;
    }
}

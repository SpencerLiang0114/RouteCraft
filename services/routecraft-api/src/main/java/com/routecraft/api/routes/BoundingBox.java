package com.routecraft.api.routes;

import java.util.List;

import tools.jackson.databind.JsonNode;

import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;

/**
 * Smallest axis-aligned WGS84 bounding box that contains all input points. Returned as
 * (west, south, east, north) for use with PostGIS's ST_MakeEnvelope.
 */
public record BoundingBox(double west, double south, double east, double north) {

    public static BoundingBox fromTypedRoutes(List<RouteCandidate> routes) {
        double west = Double.POSITIVE_INFINITY;
        double south = Double.POSITIVE_INFINITY;
        double east = Double.NEGATIVE_INFINITY;
        double north = Double.NEGATIVE_INFINITY;
        boolean hasPoint = false;
        for (RouteCandidate route : routes) {
            if (route.geometry() == null) continue;
            for (LatLng point : route.geometry()) {
                if (point.lat() < south) south = point.lat();
                if (point.lat() > north) north = point.lat();
                if (point.lng() < west) west = point.lng();
                if (point.lng() > east) east = point.lng();
                hasPoint = true;
            }
        }
        return hasPoint ? new BoundingBox(west, south, east, north) : null;
    }

    public static BoundingBox fromJsonRoutes(List<JsonNode> routes) {
        double west = Double.POSITIVE_INFINITY;
        double south = Double.POSITIVE_INFINITY;
        double east = Double.NEGATIVE_INFINITY;
        double north = Double.NEGATIVE_INFINITY;
        boolean hasPoint = false;
        for (JsonNode route : routes) {
            JsonNode geometry = route.get("geometry");
            if (geometry == null || !geometry.isArray()) continue;
            for (JsonNode point : geometry) {
                JsonNode latNode = point.get("lat");
                JsonNode lngNode = point.get("lng");
                if (latNode == null || !latNode.isNumber() || lngNode == null || !lngNode.isNumber()) continue;
                double lat = latNode.asDouble();
                double lng = lngNode.asDouble();
                if (lat < south) south = lat;
                if (lat > north) north = lat;
                if (lng < west) west = lng;
                if (lng > east) east = lng;
                hasPoint = true;
            }
        }
        return hasPoint ? new BoundingBox(west, south, east, north) : null;
    }
}

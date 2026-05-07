package com.routecraft.api.routing.osm;

import com.routecraft.api.routing.model.LatLng;

public record BBox(double south, double west, double north, double east) {

    public static BBox around(LatLng point, double radiusKm) {
        double latDelta = radiusKm / 111.0;
        double lngDelta = radiusKm / (111.0 * Math.cos((point.lat() * Math.PI) / 180.0));
        return new BBox(point.lat() - latDelta, point.lng() - lngDelta,
                point.lat() + latDelta, point.lng() + lngDelta);
    }

    public String key() {
        return south + "," + west + "," + north + "," + east;
    }
}

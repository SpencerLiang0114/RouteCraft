package com.routecraft.api.routing.osm;

import java.util.List;

import com.routecraft.api.routing.model.LatLng;

public record GreenFeature(List<LatLng> geometry, OsmTagging.GreenKind kind) {
}

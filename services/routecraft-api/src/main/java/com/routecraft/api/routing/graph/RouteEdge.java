package com.routecraft.api.routing.graph;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.routecraft.api.routing.model.LatLng;

public final class RouteEdge {

    private final String id;
    private final String from;
    private final String to;
    private final String undirectedKey;
    private final double distanceM;
    private final List<LatLng> geometry;
    private final String surfaceType;
    private final String roadType;
    private final Double elevationGainM;
    private final Double fromAbsElevM;
    private final Double toAbsElevM;
    private final Double slope;
    private final double parkScore;
    private final double shadeScore;
    private final double safetyScore;
    private final double sceneryScore;
    private final double bikeScore;
    private final double walkScore;
    private final boolean accessAllowed;
    private final Double noveltyScore;
    private final Double trafficExposure;
    private final List<String> accessRestrictions;

    private RouteEdge(Builder builder) {
        this.id = builder.id;
        this.from = builder.from;
        this.to = builder.to;
        this.undirectedKey = GeoUtils.undirectedEdgeKey(builder.from, builder.to);
        this.distanceM = builder.distanceM;
        this.geometry = builder.geometry == null ? List.of() : List.copyOf(builder.geometry);
        this.surfaceType = builder.surfaceType;
        this.roadType = builder.roadType;
        this.elevationGainM = builder.elevationGainM;
        this.fromAbsElevM = builder.fromAbsElevM;
        this.toAbsElevM = builder.toAbsElevM;
        this.slope = builder.slope;
        this.parkScore = builder.parkScore;
        this.shadeScore = builder.shadeScore;
        this.safetyScore = builder.safetyScore;
        this.sceneryScore = builder.sceneryScore;
        this.bikeScore = builder.bikeScore;
        this.walkScore = builder.walkScore;
        this.accessAllowed = builder.accessAllowed;
        this.noveltyScore = builder.noveltyScore;
        this.trafficExposure = builder.trafficExposure;
        this.accessRestrictions = builder.accessRestrictions == null ? null : List.copyOf(builder.accessRestrictions);
    }

    public String id() {
        return id;
    }

    public String from() {
        return from;
    }

    public String to() {
        return to;
    }

    public double distanceM() {
        return distanceM;
    }

    public List<LatLng> geometry() {
        return geometry;
    }

    public String surfaceType() {
        return surfaceType;
    }

    public String roadType() {
        return roadType;
    }

    public Double elevationGainM() {
        return elevationGainM;
    }

    public Double fromAbsElevM() {
        return fromAbsElevM;
    }

    public Double toAbsElevM() {
        return toAbsElevM;
    }

    public Double slope() {
        return slope;
    }

    public double parkScore() {
        return parkScore;
    }

    public double shadeScore() {
        return shadeScore;
    }

    public double safetyScore() {
        return safetyScore;
    }

    public double sceneryScore() {
        return sceneryScore;
    }

    public double bikeScore() {
        return bikeScore;
    }

    public double walkScore() {
        return walkScore;
    }

    public boolean accessAllowed() {
        return accessAllowed;
    }

    public Double noveltyScore() {
        return noveltyScore;
    }

    public Double trafficExposure() {
        return trafficExposure;
    }

    public List<String> accessRestrictions() {
        return accessRestrictions;
    }

    public String undirectedKey() {
        return undirectedKey;
    }

    public Builder toBuilder() {
        return new Builder()
                .id(id).from(from).to(to)
                .distanceM(distanceM).geometry(geometry)
                .surfaceType(surfaceType).roadType(roadType)
                .elevationGainM(elevationGainM)
                .fromAbsElevM(fromAbsElevM).toAbsElevM(toAbsElevM)
                .slope(slope)
                .parkScore(parkScore).shadeScore(shadeScore).safetyScore(safetyScore)
                .sceneryScore(sceneryScore).bikeScore(bikeScore).walkScore(walkScore)
                .accessAllowed(accessAllowed)
                .noveltyScore(noveltyScore).trafficExposure(trafficExposure)
                .accessRestrictions(accessRestrictions);
    }

    public RouteEdge reverse() {
        List<LatLng> reversed = new ArrayList<>(geometry);
        Collections.reverse(reversed);
        return toBuilder()
                .id(id + "-reverse")
                .from(to)
                .to(from)
                .geometry(reversed)
                .fromAbsElevM(toAbsElevM)
                .toAbsElevM(fromAbsElevM)
                .elevationGainM(elevationGainM == null ? null : -elevationGainM)
                .slope(slope == null ? null : -slope)
                .build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String id;
        private String from;
        private String to;
        private double distanceM;
        private List<LatLng> geometry;
        private String surfaceType;
        private String roadType;
        private Double elevationGainM;
        private Double fromAbsElevM;
        private Double toAbsElevM;
        private Double slope;
        private double parkScore;
        private double shadeScore;
        private double safetyScore;
        private double sceneryScore;
        private double bikeScore;
        private double walkScore;
        private boolean accessAllowed = true;
        private Double noveltyScore;
        private Double trafficExposure;
        private List<String> accessRestrictions;

        public Builder id(String id) { this.id = id; return this; }
        public Builder from(String from) { this.from = from; return this; }
        public Builder to(String to) { this.to = to; return this; }
        public Builder distanceM(double distanceM) { this.distanceM = distanceM; return this; }
        public Builder geometry(List<LatLng> geometry) { this.geometry = geometry; return this; }
        public Builder surfaceType(String surfaceType) { this.surfaceType = surfaceType; return this; }
        public Builder roadType(String roadType) { this.roadType = roadType; return this; }
        public Builder elevationGainM(Double elevationGainM) { this.elevationGainM = elevationGainM; return this; }
        public Builder fromAbsElevM(Double fromAbsElevM) { this.fromAbsElevM = fromAbsElevM; return this; }
        public Builder toAbsElevM(Double toAbsElevM) { this.toAbsElevM = toAbsElevM; return this; }
        public Builder slope(Double slope) { this.slope = slope; return this; }
        public Builder parkScore(double parkScore) { this.parkScore = parkScore; return this; }
        public Builder shadeScore(double shadeScore) { this.shadeScore = shadeScore; return this; }
        public Builder safetyScore(double safetyScore) { this.safetyScore = safetyScore; return this; }
        public Builder sceneryScore(double sceneryScore) { this.sceneryScore = sceneryScore; return this; }
        public Builder bikeScore(double bikeScore) { this.bikeScore = bikeScore; return this; }
        public Builder walkScore(double walkScore) { this.walkScore = walkScore; return this; }
        public Builder accessAllowed(boolean accessAllowed) { this.accessAllowed = accessAllowed; return this; }
        public Builder noveltyScore(Double noveltyScore) { this.noveltyScore = noveltyScore; return this; }
        public Builder trafficExposure(Double trafficExposure) { this.trafficExposure = trafficExposure; return this; }
        public Builder accessRestrictions(List<String> accessRestrictions) { this.accessRestrictions = accessRestrictions; return this; }

        public RouteEdge build() {
            return new RouteEdge(this);
        }
    }
}

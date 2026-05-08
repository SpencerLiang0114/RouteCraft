package com.routecraft.api.routing.graph;

import java.util.List;
import java.util.Locale;

import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.UserPreferences;

public final class GeoUtils {

    private static final double EARTH_RADIUS_KM = 6371.0;
    private static final double EARTH_RADIUS_M = 6371000.0;
    private static final double FALLBACK_TARGET_DISTANCE_KM = 5.0;

    private GeoUtils() {
    }

    public static double round(double value, int decimals) {
        double factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }

    public static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    public static double clamp(double value) {
        return clamp(value, 0, 100);
    }

    public static double toRadians(double degrees) {
        return (degrees * Math.PI) / 180.0;
    }

    public static double toDegrees(double radians) {
        return (radians * 180.0) / Math.PI;
    }

    public static double haversineDistanceKm(LatLng a, LatLng b) {
        double dLat = toRadians(b.lat() - a.lat());
        double dLng = toRadians(b.lng() - a.lng());
        double latA = toRadians(a.lat());
        double latB = toRadians(b.lat());
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    }

    public static double distanceM(LatLng a, LatLng b) {
        return haversineDistanceKm(a, b) * 1000.0;
    }

    public static double calculateGeometryDistanceM(List<LatLng> geometry) {
        double total = 0;
        for (int i = 1; i < geometry.size(); i++) {
            total += distanceM(geometry.get(i - 1), geometry.get(i));
        }
        return total;
    }

    public static double bearingDegrees(LatLng from, LatLng to) {
        double startLat = toRadians(from.lat());
        double endLat = toRadians(to.lat());
        double deltaLng = toRadians(to.lng() - from.lng());
        double y = Math.sin(deltaLng) * Math.cos(endLat);
        double x = Math.cos(startLat) * Math.sin(endLat)
                - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
        return (toDegrees(Math.atan2(y, x)) + 360.0) % 360.0;
    }

    public static LatLng destinationPoint(LatLng start, double bearing, double meters) {
        double angularDistance = meters / EARTH_RADIUS_M;
        double bearingRad = toRadians(bearing);
        double latRad = toRadians(start.lat());
        double lngRad = toRadians(start.lng());

        double destLat = Math.asin(
                Math.sin(latRad) * Math.cos(angularDistance)
                        + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad));

        double destLng = lngRad
                + Math.atan2(
                        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
                        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat));

        return new LatLng(round(toDegrees(destLat), 6), round(toDegrees(destLng), 6));
    }

    public static double angularDifference(double a, double b) {
        double difference = Math.abs(a - b) % 360.0;
        return difference > 180.0 ? 360.0 - difference : difference;
    }

    public static double normalizePreference(Double value) {
        if (value == null) {
            return 0.5;
        }
        if (value <= 1.0) {
            return Math.max(0, Math.min(1, value));
        }
        return Math.max(0, Math.min(1, (value - 1) / 2));
    }

    public static double normalizePreference(double value) {
        return normalizePreference((Double) value);
    }

    public static double activityPaceMinPerKm(ActivityType activity) {
        return switch (activity) {
            case RUNNING -> 5.6;
            case HIKING -> 12.5;
            case CYCLING -> 3.1;
        };
    }

    public static int estimateDurationMin(ActivityType activity, double distanceKm) {
        return Math.max(1, (int) Math.round(distanceKm * activityPaceMinPerKm(activity)));
    }

    public static double resolveTargetDistanceKm(UserPreferences preferences) {
        Double targetDistance = preferences.targetDistanceKm();
        if (targetDistance != null && targetDistance > 0) {
            return targetDistance;
        }
        Double targetDuration = preferences.targetDurationMin();
        if (targetDuration != null && targetDuration > 0) {
            return round(targetDuration / activityPaceMinPerKm(preferences.activity()), 1);
        }
        return FALLBACK_TARGET_DISTANCE_KM;
    }

    public static double distanceToleranceRatio(double targetDistanceKm) {
        // Percentage-based: ~20 % at 3 km, ~12 % at 10 km, ~8 % at 20 km+
        return Math.max(0.08, 0.35 / Math.sqrt(Math.max(targetDistanceKm, 0.1)));
    }

    public static double weightedAverage(List<double[]> valuesAndWeights, double fallback) {
        double totalWeight = 0;
        double weightedSum = 0;
        for (double[] vw : valuesAndWeights) {
            totalWeight += vw[1];
            weightedSum += vw[0] * vw[1];
        }
        return totalWeight <= 0 ? fallback : weightedSum / totalWeight;
    }

    public static boolean isAfternoonDeparture(String departureTime) {
        String value = departureTime == null ? "" : departureTime.toLowerCase(Locale.ROOT);
        return value.contains("afternoon")
                || value.contains("12:")
                || value.contains("13:")
                || value.contains("14:")
                || value.contains("15:");
    }

    public static boolean isNightDeparture(String departureTime) {
        String value = departureTime == null ? "" : departureTime.toLowerCase(Locale.ROOT);
        return value.contains("night")
                || value.contains("late")
                || value.contains("22:")
                || value.contains("23:");
    }

    public static String undirectedEdgeKey(String from, String to) {
        return from.compareTo(to) <= 0 ? from + "<>" + to : to + "<>" + from;
    }

    public static boolean wantsClimbing(UserPreferences preferences) {
        return preferences.routeStyle() == com.routecraft.api.routing.model.RouteStyle.CLIMBING;
    }

    public static List<LatLng> decodePolyline(String encoded) {
        List<LatLng> path = new java.util.ArrayList<>();
        int index = 0, len = encoded.length();
        int lat = 0, lng = 0;

        while (index < len) {
            int b, shift = 0, result = 0;
            do {
                b = encoded.charAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            int dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;
            do {
                b = encoded.charAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            int dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            path.add(new LatLng(((double) lat / 1E5), ((double) lng / 1E5)));
        }
        return path;
    }

    public static double pointToSegmentDistanceKm(LatLng point, LatLng start, LatLng end) {
        double[] startVector = projectedOffsetKm(point, start);
        double[] endVector = projectedOffsetKm(point, end);
        double segmentX = endVector[0] - startVector[0];
        double segmentY = endVector[1] - startVector[1];
        double segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

        if (segmentLengthSquared == 0) {
            return haversineDistanceKm(point, start);
        }

        double projection = clamp(
                -(startVector[0] * segmentX + startVector[1] * segmentY) / segmentLengthSquared,
                0,
                1
        );
        double closestX = startVector[0] + segmentX * projection;
        double closestY = startVector[1] + segmentY * projection;

        return Math.sqrt(closestX * closestX + closestY * closestY);
    }

    public static double[] projectedOffsetKm(LatLng origin, LatLng point) {
        double kmPerDegreeLat = 111.32;
        double kmPerDegreeLng = kmPerDegreeLat * Math.cos(toRadians(origin.lat()));

        return new double[]{
                (point.lng() - origin.lng()) * kmPerDegreeLng,
                (point.lat() - origin.lat()) * kmPerDegreeLat
        };
    }
}

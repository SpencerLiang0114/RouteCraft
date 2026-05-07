package com.routecraft.api.routing.osm;

import java.util.Map;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.model.ActivityType;

public final class OsmTagging {

    private OsmTagging() {
    }

    public static boolean accessAllowed(Map<String, String> tags, ActivityType activity) {
        String access = tags.get("access");
        String foot = tags.get("foot");
        String bicycle = tags.get("bicycle");
        String highway = tags.get("highway");
        boolean privateAccess = "private".equals(access) || "no".equals(access)
                || "customers".equals(access) || "permit".equals(access);
        if (privateAccess || tags.containsKey("access:conditional")) {
            return false;
        }
        if ((activity == ActivityType.RUNNING || activity == ActivityType.HIKING)
                && ("no".equals(foot) || "motorway".equals(highway))) {
            return false;
        }
        if (activity == ActivityType.CYCLING) {
            if ("no".equals(bicycle)) {
                return false;
            }
            if ("footway".equals(highway) && !"yes".equals(bicycle) && !"designated".equals(bicycle)) {
                return false;
            }
        }
        return true;
    }

    public static String roadType(Map<String, String> tags) {
        String highway = tags.get("highway");
        if ("cycleway".equals(highway)) return "bike_path";
        if ("path".equals(highway) || "footway".equals(highway) || "pedestrian".equals(highway)) {
            String surface = tags.get("surface");
            return ("dirt".equals(surface) || "ground".equals(surface)) ? "trail" : "park_path";
        }
        return highway != null ? highway : "path";
    }

    public static String surfaceType(Map<String, String> tags) {
        String surface = tags.get("surface");
        if (surface != null) return surface;
        String highway = tags.get("highway");
        if ("path".equals(highway) || "track".equals(highway)) return "dirt";
        return "paved";
    }

    public static double trafficExposure(Map<String, String> tags) {
        String highway = tags.get("highway");
        if ("primary".equals(highway)) return 0.86;
        if ("secondary".equals(highway)) return 0.68;
        if ("tertiary".equals(highway)) return 0.48;
        if ("residential".equals(highway) || "living_street".equals(highway)) return 0.18;
        if ("cycleway".equals(highway) || "footway".equals(highway)
                || "path".equals(highway) || "pedestrian".equals(highway)) return 0.04;
        return 0.28;
    }

    public static double safetyScore(Map<String, String> tags) {
        double exposure = trafficExposure(tags);
        String sidewalk = tags.get("sidewalk");
        double sidewalkBonus = sidewalk != null && !"no".equals(sidewalk) ? 0.14 : 0;
        double litBonus = "yes".equals(tags.get("lit")) ? 0.06 : 0;
        String highway = tags.get("highway");
        double pathBonus = ("cycleway".equals(highway) || "footway".equals(highway)
                || "path".equals(highway) || "pedestrian".equals(highway)) ? 0.16 : 0;
        double speedPenalty = 0;
        String maxspeed = tags.get("maxspeed");
        if (maxspeed != null) {
            try {
                int n = Integer.parseInt(maxspeed.replaceAll("[^0-9]", ""));
                speedPenalty = GeoUtils.clamp((n - 25.0) / 120.0, 0, 0.2);
            } catch (NumberFormatException ignored) {
            }
        }
        return GeoUtils.clamp(0.86 - exposure * 0.5 + sidewalkBonus + litBonus + pathBonus - speedPenalty, 0.05, 0.98);
    }

    public static double bikeScore(Map<String, String> tags) {
        String highway = tags.get("highway");
        String bicycle = tags.get("bicycle");
        if ("cycleway".equals(highway) || "designated".equals(bicycle)) return 0.96;
        if (tags.containsKey("cycleway") || tags.containsKey("cycleway:left") || tags.containsKey("cycleway:right")) return 0.82;
        if ("residential".equals(highway) || "living_street".equals(highway)) return 0.68;
        if ("path".equals(highway) && !"no".equals(bicycle)) return 0.62;
        if ("primary".equals(highway) || "secondary".equals(highway)) return 0.34;
        return 0.52;
    }

    public static double walkScore(Map<String, String> tags) {
        String highway = tags.get("highway");
        String foot = tags.get("foot");
        if ("footway".equals(highway) || "pedestrian".equals(highway) || "designated".equals(foot)) return 0.96;
        if ("path".equals(highway) || "track".equals(highway)) return 0.9;
        String sidewalk = tags.get("sidewalk");
        if (sidewalk != null && !"no".equals(sidewalk)) return 0.78;
        if ("residential".equals(highway) || "living_street".equals(highway)) return 0.7;
        return 0.44;
    }

    public static double shadeScore(Map<String, String> tags, double greenShadeScore) {
        if ("yes".equals(tags.get("covered")) || "yes".equals(tags.get("tunnel"))) return 0.95;
        if ("yes".equals(tags.get("tree_lined"))) {
            return GeoUtils.clamp(0.72 + greenShadeScore * 0.2, 0, 0.96);
        }
        double exposure = trafficExposure(tags);
        return GeoUtils.clamp(0.35 + greenShadeScore * 0.58 - exposure * 0.18, 0.04, 0.96);
    }

    public static GreenKind greenKind(Map<String, String> tags) {
        if ("water".equals(tags.get("natural"))) return GreenKind.WATER;
        if ("wood".equals(tags.get("natural")) || "forest".equals(tags.get("landuse"))) return GreenKind.WOODS;
        if ("park".equals(tags.get("leisure")) || "nature_reserve".equals(tags.get("leisure"))) return GreenKind.PARK;
        return GreenKind.GREEN;
    }

    public enum GreenKind {
        PARK, WOODS, WATER, GREEN
    }
}

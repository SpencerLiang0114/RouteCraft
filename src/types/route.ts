export type ActivityType = "running" | "hiking" | "cycling";

export type RouteSource = "generated" | "strava" | "uploaded";

export type RouteType = "loop" | "point_to_point" | "out_and_back";

export type RouteGoalMode = "distance" | "time" | "point_to_point" | "loop" | "out_and_back";

export type RouteStyle =
  | "easy_flat"
  | "park_heavy"
  | "shaded"
  | "scenic"
  | "climbing"
  | "exploration";

export type Difficulty = "Easy" | "Moderate" | "Hard";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface UserPreferences {
  activity: ActivityType;
  routeType: RouteType;
  targetDistanceKm?: number;
  targetDurationMin?: number;
  startPoint?: LatLng;
  endPoint?: LatLng;
  parkPreference: number;
  shadePreference: number;
  elevationPreference: number;
  safetyPreference: number;
  explorationPreference: number;
  departureTime: string;
  goalMode?: RouteGoalMode;
  routeStyle?: RouteStyle;
}

export interface RouteMetrics {
  parkScore: number;
  shadeScore: number;
  safetyScore: number;
  explorationScore: number;
  sceneryScore: number;
  elevationScore: number;
  distanceScore: number;
  totalScore: number;
}

export interface ElevationPoint {
  distanceKm: number;
  elevM: number;
}

export interface RouteCandidate {
  id: string;
  source: RouteSource;
  name: string;
  activity: ActivityType;
  routeType?: RouteType;
  geometry: LatLng[];
  waypoints?: LatLng[];
  distanceKm: number;
  estimatedDurationMin: number;
  elevationGainM: number;
  totalDescentM?: number;
  averageSlopePct?: number;
  maxSlopePct?: number;
  lowestElevM?: number;
  highestElevM?: number;
  elevDifferenceM?: number;
  elevationProfile?: ElevationPoint[];
  difficulty?: Difficulty;
  metrics: RouteMetrics;
  explanation: string;
}

export interface SavedRoute extends RouteCandidate {
  savedAt: string;
}

export interface RouteAnalysisSignals {
  parkAccess: number;
  shadeCover: number;
  roadExposure: number;
  safety: number;
  novelty: number;
  scenery: number;
  surfaceQuality: number;
  intersectionComplexity: number;
}

export interface ExternalRouteMock {
  id: string;
  source: Extract<RouteSource, "strava">;
  name: string;
  activity: ActivityType;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationMin?: number;
  difficulty?: Difficulty;
  routeType?: RouteType;
  geometry: LatLng[];
  waypoints?: LatLng[];
  signals: RouteAnalysisSignals;
}

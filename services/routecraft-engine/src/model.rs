use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct Point {
    pub lat: f64,
    #[serde(alias = "lon")]
    pub lng: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub activity: Activity,
    pub route_type: RouteType,
    pub target_distance_km: Option<f64>,
    pub target_duration_min: Option<f64>,
    pub start_point: Option<Point>,
    pub end_point: Option<Point>,
    pub park_preference: f64,
    pub shade_preference: f64,
    pub elevation_preference: f64,
    pub safety_preference: f64,
    pub exploration_preference: f64,
    #[serde(default)]
    pub departure_time: String,
    pub route_style: Option<Style>,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Activity {
    Running,
    Hiking,
    Cycling,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RouteType {
    Loop,
    OutAndBack,
    PointToPoint,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Style {
    EasyFlat,
    ParkHeavy,
    Shaded,
    Scenic,
    Climbing,
    Exploration,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct OsmElement {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: i64,
    pub nodes: Option<Vec<i64>>,
    pub geometry: Option<Vec<Point>>,
    pub tags: Option<HashMap<String, String>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Node {
    pub id: String,
    pub point: Point,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub distance_m: f64,
    pub geometry: Arc<[Point]>,
    pub surface_type: String,
    pub road_type: String,
    pub elevation_gain_m: Option<f64>,
    pub from_abs_elev_m: Option<f64>,
    pub to_abs_elev_m: Option<f64>,
    pub slope: Option<f64>,
    pub park_score: f64,
    pub shade_score: f64,
    pub safety_score: f64,
    pub scenery_score: f64,
    pub bike_score: f64,
    pub walk_score: f64,
    pub access_allowed: bool,
    pub novelty_score: Option<f64>,
    pub traffic_exposure: Option<f64>,
    pub access_restrictions: Option<Vec<String>>,
}
impl Edge {
    pub fn key(&self) -> String {
        crate::geo::edge_key(&self.from, &self.to)
    }
    pub fn reverse(&self) -> Self {
        Self {
            id: format!("{}-reverse", self.id),
            from: self.to.clone(),
            to: self.from.clone(),
            geometry: self.geometry.iter().rev().copied().collect(),
            from_abs_elev_m: self.to_abs_elev_m,
            to_abs_elev_m: self.from_abs_elev_m,
            elevation_gain_m: self.elevation_gain_m.map(|x| -x),
            slope: self.slope.map(|x| -x),
            ..self.clone()
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Draft {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub park_score: f64,
    pub shade_score: f64,
    pub safety_score: f64,
    pub exploration_score: f64,
    pub scenery_score: f64,
    pub elevation_score: f64,
    pub distance_score: f64,
    pub total_score: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationPoint {
    pub distance_km: f64,
    pub elev_m: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub source: String,
    pub name: String,
    pub activity: Activity,
    pub route_type: RouteType,
    pub geometry: Vec<Point>,
    pub waypoints: Vec<Point>,
    pub distance_km: f64,
    pub estimated_duration_min: i32,
    pub elevation_gain_m: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_descent_m: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub average_slope_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_slope_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lowest_elev_m: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highest_elev_m: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elev_difference_m: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elevation_profile: Option<Vec<ElevationPoint>>,
    pub difficulty: String,
    pub metrics: Metrics,
    pub explanation: String,
}

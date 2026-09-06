use crate::{
    geo::*,
    graph::{Graph, afternoon, night},
    model::*,
    search::Path,
};
use std::collections::{HashMap, HashSet};
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Strategy {
    Recommended,
    Exploration,
    Park,
    Direct,
}
#[derive(Clone)]
pub struct Generated {
    pub candidate: Candidate,
    pub path: Path,
    pub strategy: Strategy,
}
#[allow(clippy::too_many_arguments)] // Mirrors the reference RouteDraft plus graph/preferences.
pub fn build(
    g: &Graph,
    p: &Preferences,
    path: Path,
    id: String,
    name: &str,
    waypoints: Vec<Point>,
    strategy: Strategy,
    reference: Option<&HashSet<String>>,
) -> Generated {
    let edges: Vec<_> = path.edges.iter().map(|&e| &g.edges[e]).collect();
    let d = round(path.distance / 1000.0, 1);
    let max_slope = edges
        .iter()
        .map(|e| e.slope.unwrap_or(0.0).abs())
        .fold(0.0, f64::max);
    let weight: f64 = edges.iter().map(|e| e.distance_m.max(1.0)).sum();
    let average = |f: fn(&Edge) -> f64| {
        if weight <= 0.0 {
            0.5
        } else {
            edges
                .iter()
                .map(|e| f(e) * e.distance_m.max(1.0))
                .sum::<f64>()
                / weight
        }
    };
    let park = average(|e| e.park_score);
    let shade = average(|e| e.shade_score);
    let safety = average(|e| e.safety_score);
    let scenery = average(|e| e.scenery_score);
    let novelty = average(|e| e.novelty_score.unwrap_or(e.scenery_score));
    let traffic = average(|e| e.traffic_exposure.unwrap_or(0.2));
    let gain = round(
        edges
            .iter()
            .map(|e| e.elevation_gain_m.unwrap_or(0.0).max(0.0))
            .sum(),
        0,
    );
    let overlap = if path.distance > 0.0 {
        path.edges
            .iter()
            .filter(|&&e| reference.is_some_and(|r| r.contains(&g.keys[e])))
            .map(|&e| g.edges[e].distance_m)
            .sum::<f64>()
            / path.distance
    } else {
        0.0
    };
    let gain_km = gain / d.max(0.1);
    let ep = normalize(p.elevation_preference);
    let cycling = p.activity == Activity::Cycling;
    let elevation_score = if p.route_style == Some(Style::Climbing) {
        let target = if cycling {
            14.0 + ep * 12.0
        } else {
            22.0 + ep * 34.0
        };
        (100.0
            - (gain_km - target).abs() * 1.25
            - (max_slope * 100.0 - if cycling { 8.0 } else { 14.0 }).max(0.0) * 4.0)
            .clamp(0.0, 100.0)
    } else {
        (100.0
            - gain_km * if cycling { 1.2 } else { 1.05 } * (0.65 + ep * 0.75)
            - (max_slope * 100.0 - if cycling { 7.0 } else { 11.0 }).max(0.0) * 3.5)
            .clamp(0.0, 100.0)
    };
    let mut metrics = Metrics {
        park_score: (park * 100.0).clamp(0.0, 100.0),
        shade_score: (shade * 100.0 - if afternoon(p) { 8.0 } else { 0.0 } * (1.0 - shade))
            .clamp(0.0, 100.0),
        safety_score: (safety * 100.0 - if night(p) { 8.0 } else { 0.0 } - traffic * 9.0)
            .clamp(0.0, 100.0),
        exploration_score: (novelty * 70.0 + (1.0 - overlap) * 30.0).clamp(0.0, 100.0),
        scenery_score: (scenery * 100.0).clamp(0.0, 100.0),
        elevation_score,
        distance_score: (100.0 - (d - target(p)).abs() / target(p).max(0.1) * 160.0)
            .clamp(0.0, 100.0),
        total_score: 0.0,
    };
    let mut weights = match p.activity {
        Activity::Running => [0.23, 0.15, 0.16, 0.15, 0.20, 0.10, 0.05],
        Activity::Hiking => [0.13, 0.18, 0.15, 0.15, 0.15, 0.12, 0.16],
        Activity::Cycling => [0.18, 0.14, 0.08, 0.08, 0.28, 0.10, 0.05],
    };
    weights[2] += normalize(p.park_preference) * 0.05;
    weights[3] += normalize(p.shade_preference) * 0.05;
    weights[4] += normalize(p.safety_preference) * 0.06;
    weights[5] += normalize(p.exploration_preference) * 0.05;
    weights[1] += ep * 0.04;
    let total: f64 = weights.iter().sum();
    for w in &mut weights {
        *w /= total;
    }
    metrics.total_score = round(
        weights
            .iter()
            .zip([
                metrics.distance_score,
                metrics.elevation_score,
                metrics.park_score,
                metrics.shade_score,
                metrics.safety_score,
                metrics.exploration_score,
                metrics.scenery_score,
            ])
            .map(|(w, s)| w * s)
            .sum(),
        0,
    );
    let explanation = explanation(p, &metrics);
    let profile = elevation_profile(&edges);
    let lowest = profile
        .iter()
        .map(|p| p.elev_m)
        .fold(f64::INFINITY, f64::min);
    let highest = profile
        .iter()
        .map(|p| p.elev_m)
        .fold(f64::NEG_INFINITY, f64::max);
    let gain: f64 = profile
        .windows(2)
        .map(|w| (w[1].elev_m - w[0].elev_m).max(0.0))
        .sum();
    let descent: f64 = profile
        .windows(2)
        .map(|w| (w[0].elev_m - w[1].elev_m).max(0.0))
        .sum();
    let max_slope = round(max_slope * 100.0, 1);
    let gd = geometry_distance(&path.geometry);
    let effort = d * if cycling { 0.35 } else { 1.0 } + gain / d.max(0.1) * 0.18 + max_slope * 0.18;
    let difficulty = if effort
        > if p.activity == Activity::Hiking {
            18.0
        } else {
            13.0
        } {
        "Hard"
    } else if effort > if cycling { 8.0 } else { 7.0 } {
        "Moderate"
    } else {
        "Easy"
    };
    let candidate = Candidate {
        id,
        source: "generated".into(),
        name: name.into(),
        activity: p.activity,
        route_type: p.route_type,
        geometry: path.geometry.clone(),
        waypoints,
        distance_km: d,
        estimated_duration_min: round(d * pace(p.activity), 0).max(1.0) as i32,
        elevation_gain_m: round(gain, 0),
        total_descent_m: Some(round(descent, 0)),
        average_slope_pct: if gd > 0.0 {
            Some(round(gain / gd * 100.0, 1))
        } else {
            None
        },
        max_slope_pct: Some(max_slope),
        lowest_elev_m: Some(round(lowest, 0)),
        highest_elev_m: Some(round(highest, 0)),
        elev_difference_m: Some(round(highest - lowest, 0)),
        elevation_profile: Some(profile),
        difficulty: difficulty.into(),
        metrics,
        explanation,
    };
    Generated {
        candidate,
        path,
        strategy,
    }
}
fn elevation_profile(edges: &[&Edge]) -> Vec<ElevationPoint> {
    let absolute = edges.iter().any(|e| e.from_abs_elev_m.is_some());
    let any = absolute
        || edges
            .iter()
            .any(|e| e.elevation_gain_m.is_some_and(|v| v != 0.0));
    let start = edges.iter().find_map(|e| e.from_abs_elev_m).unwrap_or(0.0);
    let mut profile = vec![ElevationPoint {
        distance_km: 0.0,
        elev_m: round(start, 0),
    }];
    let mut real = if absolute { vec![0] } else { vec![] };
    let mut dist = 0.0;
    let mut elevation = start;
    for e in edges {
        dist += e.distance_m;
        if let Some(value) = e.to_abs_elev_m.filter(|_| absolute) {
            elevation = value;
            real.push(profile.len());
        } else {
            elevation += if any {
                e.elevation_gain_m.unwrap_or(0.0)
            } else if e.geometry.len() < 2 {
                0.0
            } else {
                let b = radians(bearing(e.geometry[0], *e.geometry.last().unwrap()));
                e.distance_m * (b.cos() * 0.018 + b.sin() * 0.01)
            };
        }
        profile.push(ElevationPoint {
            distance_km: round(dist / 10.0, 0) / 100.0,
            elev_m: round(elevation, 0),
        });
    }
    if absolute {
        for w in real.windows(2) {
            let lo = w[0];
            let hi = w[1];
            let a = profile[lo].elev_m;
            let b = profile[hi].elev_m;
            let d0 = profile[lo].distance_km;
            let span = profile[hi].distance_km - d0;
            for item in &mut profile[lo + 1..hi] {
                let t = if span > 0.0 {
                    (item.distance_km - d0) / span
                } else {
                    0.0
                };
                item.elev_m = round(a + t * (b - a), 0);
            }
        }
        if let Some(&last) = real.last() {
            let v = profile[last].elev_m;
            for item in &mut profile[last + 1..] {
                item.elev_m = v;
            }
        }
    }
    profile
}
fn explanation(p: &Preferences, m: &Metrics) -> String {
    let mut reasons = Vec::new();
    if m.park_score >= 70.0 {
        reasons.push("uses park paths and green corridors");
    }
    if m.elevation_score >= 78.0 {
        reasons.push(if p.route_style == Some(Style::Climbing) {
            "adds a measured climbing profile"
        } else {
            "keeps elevation controlled"
        });
    }
    if m.shade_score >= 70.0 {
        reasons.push("prioritizes shade");
    }
    if m.safety_score >= 76.0 {
        reasons.push("avoids higher-stress road segments");
    }
    if m.exploration_score >= 72.0 {
        reasons.push("adds legal alternative paths for novelty");
    }
    if m.scenery_score >= 74.0 {
        reasons.push("includes scenic segments");
    }
    if reasons.is_empty() {
        let activity = match p.activity {
            Activity::Running => "running",
            Activity::Hiking => "hiking",
            Activity::Cycling => "cycling",
        };
        return format!(
            "Balances distance, safety, surface quality, and outdoor appeal for your {activity}."
        );
    }
    reasons.truncate(4);
    let mut body = reasons.join(", ");
    body[..1].make_ascii_uppercase();
    if afternoon(p) && m.shade_score >= 65.0 {
        body.push_str(" during your selected afternoon departure time");
    }
    body.push('.');
    body
}
pub fn rank(routes: &mut [Generated]) {
    routes.sort_by(|a, b| {
        b.candidate
            .metrics
            .total_score
            .total_cmp(&a.candidate.metrics.total_score)
            .then(
                b.candidate
                    .metrics
                    .distance_score
                    .total_cmp(&a.candidate.metrics.distance_score),
            )
            .then(
                a.candidate
                    .elevation_gain_m
                    .abs()
                    .total_cmp(&b.candidate.elevation_gain_m.abs()),
            )
    });
}
pub fn diverse(
    g: &Graph,
    routes: &[Generated],
    max_overlap: f64,
    threshold: f64,
    limit: usize,
) -> Vec<Generated> {
    let mut kept: Vec<(Generated, HashMap<&str, f64>, Point)> = Vec::new();
    for route in routes {
        let geometry = &route.candidate.geometry;
        let centroid = Point {
            lat: geometry.iter().map(|p| p.lat).sum::<f64>() / geometry.len() as f64,
            lng: geometry.iter().map(|p| p.lng).sum::<f64>() / geometry.len() as f64,
        };
        let mut distances = HashMap::new();
        for &e in &route.path.edges {
            *distances.entry(g.keys[e].as_str()).or_insert(0.0) += g.edges[e].distance_m;
        }
        if kept.iter().any(|(other, map, center)| {
            if distance(centroid, *center) / 1000.0 < threshold {
                return true;
            }
            let shared: f64 = distances
                .iter()
                .filter_map(|(k, v)| map.get(k).map(|b| v.min(*b)))
                .sum();
            let shorter = route.candidate.distance_km.min(other.candidate.distance_km) * 1000.0;
            shorter > 0.0 && shared / shorter > max_overlap
        }) {
            continue;
        }
        kept.push((route.clone(), distances, centroid));
        if kept.len() >= limit {
            break;
        }
    }
    kept.into_iter().map(|k| k.0).collect()
}
pub fn select(g: &Graph, p: &Preferences, raw: Vec<Generated>) -> Vec<Candidate> {
    let target = target(p);
    let mut pool: Vec<_> = raw
        .iter()
        .filter(|c| (c.candidate.distance_km - target).abs() / target <= tolerance(target))
        .cloned()
        .collect();
    if pool.len() < 3 {
        let mut by_miss = raw;
        by_miss.sort_by(|a, b| {
            (a.candidate.distance_km - target)
                .abs()
                .total_cmp(&(b.candidate.distance_km - target).abs())
        });
        pool.extend(by_miss);
        let mut seen = HashSet::new();
        pool.retain(|c| seen.insert(c.candidate.id.clone()));
        pool.truncate(8);
    }
    rank(&mut pool);
    let mut result = diverse(g, &pool, 0.65, target * 0.10, 3);
    if result.len() < 3 {
        result = diverse(g, &pool, 0.85, target * 0.10, 3);
    }
    result.sort_by(|a, b| {
        b.candidate
            .metrics
            .total_score
            .total_cmp(&a.candidate.metrics.total_score)
    });
    result.into_iter().take(3).map(|c| c.candidate).collect()
}

use crate::{geo::*, model::*};
use std::collections::HashMap;

pub struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub indices: HashMap<String, usize>,
    offsets: Vec<usize>,
    adjacency: Vec<usize>,
    pub to: Vec<usize>,
    pub from: Vec<usize>,
    pub keys: Vec<String>,
    tree: Option<Box<KdNode>>,
    pub iteration: Vec<usize>,
}
struct KdNode {
    index: usize,
    axis: usize,
    left: Option<Box<KdNode>>,
    right: Option<Box<KdNode>>,
}
impl KdNode {
    fn build(mut ids: Vec<usize>, nodes: &[Node], depth: usize) -> Option<Box<Self>> {
        if ids.is_empty() {
            return None;
        }
        let axis = depth % 2;
        ids.sort_by(|&a, &b| {
            if axis == 0 {
                nodes[a].point.lat.total_cmp(&nodes[b].point.lat)
            } else {
                nodes[a].point.lng.total_cmp(&nodes[b].point.lng)
            }
        });
        let mid = ids.len() / 2;
        Some(Box::new(Self {
            index: ids[mid],
            axis,
            left: Self::build(ids[..mid].to_vec(), nodes, depth + 1),
            right: Self::build(ids[mid + 1..].to_vec(), nodes, depth + 1),
        }))
    }
    fn near_far(&self, p: Point, q: Point) -> (&Option<Box<Self>>, &Option<Box<Self>>, Point) {
        let left = if self.axis == 0 {
            p.lat < q.lat
        } else {
            p.lng < q.lng
        };
        let plane = if self.axis == 0 {
            Point {
                lat: q.lat,
                lng: p.lng,
            }
        } else {
            Point {
                lat: p.lat,
                lng: q.lng,
            }
        };
        if left {
            (&self.left, &self.right, plane)
        } else {
            (&self.right, &self.left, plane)
        }
    }
    fn nearest(&self, nodes: &[Node], p: Point, best: &mut Option<(usize, f64)>) {
        let q = nodes[self.index].point;
        let d = distance(p, q);
        if best.is_none_or(|b| d < b.1) {
            *best = Some((self.index, d));
        }
        let (near, far, plane) = self.near_far(p, q);
        if let Some(n) = near {
            n.nearest(nodes, p, best);
        }
        if distance(p, plane) < best.unwrap().1
            && let Some(n) = far
        {
            n.nearest(nodes, p, best);
        }
    }
    fn ring(&self, nodes: &[Node], p: Point, r: f64, t: f64, out: &mut Vec<(usize, f64)>) {
        let q = nodes[self.index].point;
        let d = distance(p, q);
        if (d - r).abs() <= t {
            out.push((self.index, d));
        }
        let (near, far, plane) = self.near_far(p, q);
        if let Some(n) = near {
            n.ring(nodes, p, r, t, out);
        }
        if distance(p, plane) <= r + t
            && let Some(n) = far
        {
            n.ring(nodes, p, r, t, out);
        }
    }
}
impl Graph {
    pub fn new(draft: Draft) -> Self {
        let nodes = draft.nodes;
        let indices: HashMap<_, _> = nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.id.clone(), i))
            .collect();
        let tree = KdNode::build((0..nodes.len()).collect(), &nodes, 0);
        let edges: Vec<_> = draft
            .edges
            .into_iter()
            .flat_map(|e| {
                let r = e.reverse();
                [e, r]
            })
            .collect();
        let from: Vec<_> = edges.iter().map(|e| indices[&e.from]).collect();
        let to: Vec<_> = edges.iter().map(|e| indices[&e.to]).collect();
        let keys = edges.iter().map(Edge::key).collect();
        let mut offsets = vec![0; nodes.len() + 1];
        for &i in &from {
            offsets[i + 1] += 1;
        }
        for i in 1..offsets.len() {
            offsets[i] += offsets[i - 1];
        }
        let mut cursors = offsets.clone();
        let mut adjacency = vec![0; edges.len()];
        for (e, &i) in from.iter().enumerate() {
            adjacency[cursors[i]] = e;
            cursors[i] += 1;
        }
        let mut ordered = nodes.clone();
        crate::osm::java_node_order(&mut ordered, nodes.len() * 2);
        let iteration = ordered.iter().map(|n| indices[&n.id]).collect();
        Self {
            nodes,
            edges,
            indices,
            offsets,
            adjacency,
            to,
            from,
            keys,
            tree,
            iteration,
        }
    }
    pub fn adjacent(&self, i: usize) -> &[usize] {
        &self.adjacency[self.offsets[i]..self.offsets[i + 1]]
    }
    pub fn nearest(&self, p: Point) -> Option<usize> {
        let mut b = None;
        if let Some(t) = &self.tree {
            t.nearest(&self.nodes, p, &mut b);
        }
        b.map(|b| b.0)
    }
    pub fn ring(&self, p: Point, r: f64, tolerance: f64) -> Vec<(usize, f64)> {
        let mut out = Vec::new();
        if let Some(t) = &self.tree {
            t.ring(&self.nodes, p, r, tolerance, &mut out);
        }
        out
    }
}
pub fn edge_cost(e: &Edge, p: &Preferences) -> f64 {
    if !e.access_allowed {
        return f64::INFINITY;
    }
    let d = e.distance_m;
    let gain = e.elevation_gain_m.unwrap_or(0.0);
    let slope = e.slope.unwrap_or(0.0).abs();
    let ep = normalize(p.elevation_preference);
    let sp = normalize(p.safety_preference);
    let shade = normalize(p.shade_preference);
    let novelty = e.novelty_score.unwrap_or(e.scenery_score);
    let mut cost = d;
    if p.route_style == Some(Style::Climbing) {
        cost -= (d * 0.24).min(ep * gain * 1.6);
        if slope > 0.12 {
            cost += d * slope * 2.2;
        }
    } else {
        cost += ep * gain * 4.5;
        cost += ep * slope * d * 1.8;
    }
    match p.route_style {
        Some(Style::EasyFlat) => {
            cost += gain * 3.5;
            cost += slope * d * 2.5;
        }
        Some(Style::ParkHeavy) => cost -= e.park_score * d * 0.28,
        Some(Style::Shaded) => cost -= e.shade_score * d * 0.35,
        Some(Style::Scenic) => cost -= e.scenery_score * d * 0.28,
        Some(Style::Exploration) => cost -= novelty * d * 0.28,
        _ => {}
    }
    cost += sp * (1.0 - e.safety_score) * d * 1.15;
    cost += shade * (1.0 - e.shade_score) * d * 0.42;
    cost -= normalize(p.park_preference) * e.park_score * d * 0.32;
    cost -= normalize(p.exploration_preference) * novelty * d * 0.24;
    cost -= e.scenery_score * d * 0.08;
    if afternoon(p) {
        cost += shade * (1.0 - e.shade_score) * d * 0.28;
    }
    if night(p) {
        cost += (1.0 - e.safety_score) * d * 0.35;
        cost += e.traffic_exposure.unwrap_or(0.25) * d * 0.18;
    }
    if p.activity == Activity::Cycling {
        cost -= e.bike_score * d * 0.32;
        cost += (1.0 - e.bike_score) * d * 0.48;
        if slope > 0.08 {
            cost += d * slope * 3.8;
        }
    } else {
        cost -= e.walk_score * d * 0.24;
        cost += (1.0 - e.walk_score) * d * 0.32;
    }
    if p.activity == Activity::Hiking {
        if matches!(e.road_type.as_str(), "trail" | "park_path") {
            cost -= 0.28 * d;
        }
        if e.road_type == "arterial" {
            cost += d * 0.28;
        }
    }
    let road = match e.road_type.as_str() {
        "highway" => 1.9,
        "arterial" => 0.75,
        "collector" => 0.28,
        "residential" => -0.03,
        "greenway" => -0.22,
        "park_path" => -0.18,
        "trail" => -0.14,
        "bike_path" => -0.24,
        _ => 0.0,
    };
    let surface = match e.surface_type.as_str() {
        "gravel" => 0.08,
        "dirt" => 0.04,
        "rough_trail" => 0.16,
        "sidewalk" => -0.04,
        "paved" => -0.03,
        _ => 0.0,
    };
    cost += road * d;
    cost += surface * d;
    cost += e.traffic_exposure.unwrap_or(0.0) * sp * d * 0.38;
    cost.max(d * 0.2)
}
pub fn afternoon(p: &Preferences) -> bool {
    let s = p.departure_time.to_lowercase();
    ["afternoon", "12:", "13:", "14:", "15:"]
        .iter()
        .any(|v| s.contains(v))
}
pub fn night(p: &Preferences) -> bool {
    let s = p.departure_time.to_lowercase();
    ["night", "late", "22:", "23:"]
        .iter()
        .any(|v| s.contains(v))
}

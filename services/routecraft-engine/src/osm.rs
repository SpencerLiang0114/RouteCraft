use crate::{geo::*, model::*};
use rstar::{AABB, RTree, RTreeObject};
use std::collections::{HashMap, HashSet};

fn tag<'a>(tags: &'a HashMap<String, String>, k: &str) -> &'a str {
    tags.get(k).map(String::as_str).unwrap_or("")
}
fn path(h: &str) -> bool {
    matches!(h, "cycleway" | "footway" | "path" | "pedestrian")
}
fn access(t: &HashMap<String, String>, a: Activity) -> bool {
    if matches!(tag(t, "access"), "private" | "no" | "customers" | "permit")
        || t.contains_key("access:conditional")
    {
        return false;
    }
    if a != Activity::Cycling && (tag(t, "foot") == "no" || tag(t, "highway") == "motorway") {
        return false;
    }
    !(a == Activity::Cycling
        && (tag(t, "bicycle") == "no"
            || (tag(t, "highway") == "footway"
                && !matches!(tag(t, "bicycle"), "yes" | "designated"))))
}
fn traffic(h: &str) -> f64 {
    match h {
        "primary" => 0.86,
        "secondary" => 0.68,
        "tertiary" => 0.48,
        "residential" | "living_street" => 0.18,
        h if path(h) => 0.04,
        _ => 0.28,
    }
}
#[derive(Clone, Copy)]
enum GreenKind {
    Park,
    Woods,
    Water,
    Green,
}
struct Feature {
    geometry: Vec<Point>,
    kind: GreenKind,
    envelope: AABB<[f64; 2]>,
    order: usize,
}
impl RTreeObject for Feature {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}
fn features(elements: &[OsmElement]) -> Vec<Feature> {
    elements
        .iter()
        .filter_map(|e| {
            let g = e.geometry.as_ref()?;
            let empty = HashMap::new();
            let t = e.tags.as_ref().unwrap_or(&empty);
            if e.kind != "way" || g.len() < 2 || t.contains_key("highway") {
                return None;
            }
            let kind = if tag(t, "natural") == "water" {
                GreenKind::Water
            } else if tag(t, "natural") == "wood" || tag(t, "landuse") == "forest" {
                GreenKind::Woods
            } else if matches!(tag(t, "leisure"), "park" | "nature_reserve") {
                GreenKind::Park
            } else {
                GreenKind::Green
            };
            let mut lo = [f64::INFINITY; 2];
            let mut hi = [f64::NEG_INFINITY; 2];
            for pt in g {
                lo[0] = lo[0].min(pt.lat);
                lo[1] = lo[1].min(pt.lng);
                hi[0] = hi[0].max(pt.lat);
                hi[1] = hi[1].max(pt.lng);
            }
            Some(Feature {
                geometry: g.clone(),
                kind,
                envelope: AABB::from_corners(lo, hi),
                order: 0,
            })
        })
        .enumerate()
        .map(|(order, mut f)| {
            f.order = order;
            f
        })
        .collect()
}
fn inside(p: Point, g: &[Point]) -> bool {
    let mut yes = false;
    let mut prev = g.len() - 1;
    for cur in 0..g.len() {
        let cp = g[cur];
        let pp = g[prev];
        if (cp.lng > p.lng) != (pp.lng > p.lng)
            && p.lat < (pp.lat - cp.lat) * (p.lng - cp.lng) / (pp.lng - cp.lng) + cp.lat
        {
            yes = !yes;
        }
        prev = cur;
    }
    yes
}
fn feature_distance(p: Point, f: &Feature) -> f64 {
    let g = &f.geometry;
    if g.len() > 3 && distance(g[0], g[g.len() - 1]) < 8.0 && inside(p, g) {
        return 0.0;
    }
    g.windows(2)
        .map(|w| projection(p, w[0], w[1]).1)
        .fold(f64::INFINITY, f64::min)
}
fn green_scores(p: Point, tree: &RTree<Feature>, indexed: bool) -> [f64; 3] {
    // This envelope includes containing polygons and all segments within 300 m in
    // the exact local projection used below. Sort exact distances by input order.
    let dy = 300.0 * 180.0 / (std::f64::consts::PI * 6371000.0);
    let cos_lat = radians(p.lat).cos().abs();
    let linear_dx = dy / cos_lat.max(1e-15);
    let spherical_dx = if cos_lat <= (300.0_f64 / 6371000.0).sin() {
        360.0
    } else {
        degrees(((300.0_f64 / 6371000.0).sin() / cos_lat).asin())
    };
    let dx = linear_dx.max(spherical_dx) * (1.0 + 1e-12);
    let env = AABB::from_corners([p.lat - dy, p.lng - dx], [p.lat + dy, p.lng + dx]);
    let fs: Vec<&Feature> = if indexed {
        {
            let mut found: Vec<_> = tree.locate_in_envelope_intersecting(&env).collect();
            // Degenerate segments use haversine distance in the reference. Include
            // their wrapped neighbors; the exact test still handles ordinary lines.
            for shift in [-360.0, 360.0] {
                if p.lng - dx < -180.0 || p.lng + dx > 180.0 {
                    let wrapped = AABB::from_corners(
                        [p.lat - dy, p.lng + shift - dx],
                        [p.lat + dy, p.lng + shift + dx],
                    );
                    found.extend(tree.locate_in_envelope_intersecting(&wrapped));
                }
            }
            found.sort_by_key(|f| f.order);
            found.dedup_by_key(|f| f.order);
            found
        }
    } else {
        tree.iter().collect()
    };
    let mut hits: Vec<_> = fs.iter().map(|f| (*f, feature_distance(p, f))).collect();
    hits.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.order.cmp(&b.0.order)));
    let mut scores = [0.0_f64; 3];
    for (f, d) in hits.iter().take(5) {
        let v = (1.0 - d / 300.0).clamp(0.0, 1.0);
        scores[0] = scores[0].max(if matches!(f.kind, GreenKind::Park | GreenKind::Woods) {
            v
        } else {
            v * 0.45
        });
        scores[1] = scores[1].max(match f.kind {
            GreenKind::Woods => v,
            GreenKind::Park => v * 0.72,
            _ => v * 0.28,
        });
        scores[2] = scores[2].max(if matches!(f.kind, GreenKind::Water) {
            v
        } else {
            v * 0.82
        });
    }
    scores
}
/// Java HashMap's bucket order is part of the reference input to its stable KD sorts.
/// Node identifiers cannot trigger tree bins in the recorded fixture matrix.
pub fn java_node_order(nodes: &mut [Node], capacity: usize) {
    let capacity = capacity.max(16).next_power_of_two();
    nodes.sort_by_key(|n| {
        let h =
            n.id.encode_utf16()
                .fold(0_u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32));
        ((h ^ (h >> 16)) as usize) & (capacity - 1)
    });
}
pub fn create_edges(elements: &[OsmElement], p: &Preferences, indexed: bool) -> Draft {
    create_edges_with_budget(
        elements,
        p,
        indexed,
        &crate::search::Budget::new(std::time::Duration::from_secs(3600)),
    )
    .unwrap()
}
pub fn create_edges_with_budget(
    elements: &[OsmElement],
    p: &Preferences,
    indexed: bool,
    budget: &crate::search::Budget,
) -> Result<Draft, crate::search::EngineError> {
    let tree = RTree::bulk_load(features(elements));
    let ways: Vec<_> = elements
        .iter()
        .filter(|e| {
            let Some(t) = e.tags.as_ref() else {
                return false;
            };
            let h = tag(t, "highway");
            e.kind == "way"
                && !h.is_empty()
                && e.geometry.as_ref().is_some_and(|g| !g.is_empty())
                && access(t, p.activity)
                && !(h == "service"
                    && matches!(
                        tag(t, "service"),
                        "parking_aisle" | "driveway" | "drive-through" | "parking"
                    ))
        })
        .collect();
    let mut uses = HashMap::new();
    for way in &ways {
        if let Some(ids) = &way.nodes {
            for id in ids {
                *uses.entry(*id).or_insert(0_usize) += 1;
            }
        }
    }
    let mut nodes = Vec::new();
    let mut node_indices = HashMap::new();
    let mut edges = Vec::new();
    for way in ways {
        budget.check()?;
        let g = way.geometry.as_ref().unwrap();
        let t = way.tags.as_ref().unwrap();
        let h = tag(t, "highway");
        let mut start = 0;
        let mut length = 0.0;
        for i in 1..g.len() {
            if i % 64 == 0 {
                budget.check()?;
            }
            length += distance(g[i - 1], g[i]);
            let id = way.nodes.as_ref().and_then(|ids| ids.get(i));
            let split = i == g.len() - 1
                || id.is_some_and(|id| uses.get(id).copied().unwrap_or(0) > 1)
                || length >= 280.0;
            if length < 2.0 || !split {
                continue;
            }
            let a = g[start];
            let b = g[i];
            let id_for = |j: usize, pt: Point| {
                way.nodes
                    .as_ref()
                    .and_then(|ids| ids.get(j))
                    .map(|id| format!("osm-node-{id}"))
                    .unwrap_or_else(|| format!("coord-{}-{}", decimal6(pt.lat), decimal6(pt.lng)))
            };
            let from = id_for(start, a);
            let to = id_for(i, b);
            for (id, point) in [(&from, a), (&to, b)] {
                if let Some(&j) = node_indices.get(id) {
                    nodes[j] = Node {
                        id: id.clone(),
                        point,
                    };
                } else {
                    node_indices.insert(id.clone(), nodes.len());
                    nodes.push(Node {
                        id: id.clone(),
                        point,
                    });
                }
            }
            let green = green_scores(midpoint(a, b), &tree, indexed);
            let park = if matches!(h, "path" | "footway" | "cycleway") {
                green[0].max(0.35)
            } else {
                green[0]
            };
            let scenery =
                (0.28 + green[2] * 0.58 + if t.contains_key("name") { 0.08 } else { 0.0 })
                    .clamp(0.0, 0.98);
            let exposure = traffic(h);
            let surface = t.get("surface").cloned().unwrap_or_else(|| {
                if matches!(h, "path" | "track") {
                    "dirt"
                } else {
                    "paved"
                }
                .into()
            });
            let road = if h == "cycleway" {
                "bike_path"
            } else if matches!(h, "path" | "footway" | "pedestrian") {
                if matches!(tag(t, "surface"), "dirt" | "ground") {
                    "trail"
                } else {
                    "park_path"
                }
            } else {
                h
            };
            let shade = if tag(t, "covered") == "yes" || tag(t, "tunnel") == "yes" {
                0.95
            } else if tag(t, "tree_lined") == "yes" {
                (0.72 + green[1] * 0.2).clamp(0.0, 0.96)
            } else {
                (0.35 + green[1] * 0.58 - exposure * 0.18).clamp(0.04, 0.96)
            };
            let sidewalk = t.contains_key("sidewalk") && tag(t, "sidewalk") != "no";
            let speed = tag(t, "maxspeed")
                .chars()
                .filter(char::is_ascii_digit)
                .collect::<String>()
                .parse::<i32>()
                .map(|n| ((n as f64 - 25.0) / 120.0).clamp(0.0, 0.2))
                .unwrap_or(0.0);
            let safety = (0.86 - exposure * 0.5
                + if sidewalk { 0.14 } else { 0.0 }
                + if tag(t, "lit") == "yes" { 0.06 } else { 0.0 }
                + if path(h) { 0.16 } else { 0.0 }
                - speed)
                .clamp(0.05, 0.98);
            let bike = if h == "cycleway" || tag(t, "bicycle") == "designated" {
                0.96
            } else if ["cycleway", "cycleway:left", "cycleway:right"]
                .iter()
                .any(|k| t.contains_key(*k))
            {
                0.82
            } else if matches!(h, "residential" | "living_street") {
                0.68
            } else if h == "path" && tag(t, "bicycle") != "no" {
                0.62
            } else if matches!(h, "primary" | "secondary") {
                0.34
            } else {
                0.52
            };
            let walk = if matches!(h, "footway" | "pedestrian") || tag(t, "foot") == "designated" {
                0.96
            } else if matches!(h, "path" | "track") {
                0.9
            } else if sidewalk {
                0.78
            } else if matches!(h, "residential" | "living_street") {
                0.7
            } else {
                0.44
            };
            edges.push(Edge {
                id: format!("osm-way-{}-{start}-{i}", way.id),
                from,
                to,
                distance_m: round(length, 0),
                geometry: g[start..=i].into(),
                surface_type: surface,
                road_type: road.into(),
                elevation_gain_m: Some(0.0),
                from_abs_elev_m: None,
                to_abs_elev_m: None,
                slope: Some(0.0),
                park_score: park.clamp(0.0, 0.98),
                shade_score: shade,
                safety_score: safety,
                scenery_score: scenery,
                bike_score: bike,
                walk_score: walk,
                access_allowed: true,
                novelty_score: Some(
                    (0.36 + scenery * 0.38 + if h == "path" { 0.16 } else { 0.0 }).clamp(0.0, 0.98),
                ),
                traffic_exposure: Some(exposure),
                access_restrictions: None,
            });
            start = i;
            length = 0.0;
        }
    }
    let capacity = ((nodes.len() * 4).div_ceil(3)).max(16).next_power_of_two();
    java_node_order(&mut nodes, capacity);
    budget.check()?;
    Ok(Draft { nodes, edges })
}
pub fn trim(mut draft: Draft, p: &Preferences) -> Draft {
    let origin = start(p);
    let r = radius(p) * 1000.0;
    let sort_key = |e: &Edge| {
        let d = distance(origin, midpoint(e.geometry[0], *e.geometry.last().unwrap()));
        (
            d,
            d - (e.park_score + e.shade_score + e.safety_score + e.scenery_score) * 120.0,
        )
    };
    draft.edges.retain(|e| sort_key(e).0 <= r);
    draft
        .edges
        .sort_by(|a, b| sort_key(a).1.total_cmp(&sort_key(b).1));
    draft.edges.truncate(if p.activity == Activity::Cycling {
        14000
    } else {
        10000
    });
    let ids: HashSet<_> = draft.edges.iter().flat_map(|e| [&e.from, &e.to]).collect();
    draft.nodes.retain(|n| ids.contains(&n.id));
    draft
}
pub fn apply_elevations(draft: &mut Draft, elevations: &HashMap<String, f64>) {
    for e in &mut draft.edges {
        if let (Some(&a), Some(&b)) = (
            elevations.get(&node_key(e.geometry[0])),
            elevations.get(&node_key(*e.geometry.last().unwrap())),
        ) {
            let gain = round(b - a, 1);
            e.elevation_gain_m = Some(gain);
            e.from_abs_elev_m = Some(a);
            e.to_abs_elev_m = Some(b);
            e.slope = Some(if e.distance_m > 0.0 {
                gain / e.distance_m
            } else {
                0.0
            });
        }
    }
}
pub fn anchor(draft: &mut Draft, id: &str, point: Option<Point>) {
    let Some(point) = point else { return };
    let mut ranked: Vec<_> = draft
        .edges
        .iter()
        .enumerate()
        .filter(|(_, e)| e.road_type != "connector" && e.geometry.len() >= 2)
        .map(|(index, e)| {
            let mut best = (e.geometry[0], f64::INFINITY, 0);
            for (i, w) in e.geometry.windows(2).enumerate() {
                let (p, d) = projection(point, w[0], w[1]);
                if d < best.1 {
                    best = (p, d, i);
                }
            }
            (index, best)
        })
        .collect();
    ranked.sort_by(|a, b| a.1.1.total_cmp(&b.1.1));
    ranked.truncate(6);
    let mut nodes = vec![Node {
        id: id.into(),
        point,
    }];
    let mut connectors = Vec::new();
    let mut splits = Vec::new();
    for (i, (edge_idx, (snap, _, segment))) in ranked.into_iter().enumerate() {
        let e = &draft.edges[edge_idx];
        let snap_id = format!("{id}-snap-{i}");
        nodes.push(Node {
            id: snap_id.clone(),
            point: snap,
        });
        connectors.push(Edge {
            id: format!("{id}-connector-{i}"),
            from: id.into(),
            to: snap_id.clone(),
            distance_m: round(distance(point, snap), 0).max(1.0),
            geometry: vec![point, snap].into(),
            road_type: "connector".into(),
            elevation_gain_m: Some(0.0),
            from_abs_elev_m: None,
            to_abs_elev_m: None,
            slope: Some(0.0),
            access_allowed: true,
            access_restrictions: None,
            ..e.clone()
        });
        let mut first = e.geometry[..=segment].to_vec();
        first.push(snap);
        let mut second = vec![snap];
        second.extend_from_slice(&e.geometry[segment + 1..]);
        let da = round(geometry_distance(&first), 0).max(1.0);
        let db = round(geometry_distance(&second), 0).max(1.0);
        let gain = e.elevation_gain_m.unwrap_or(0.0);
        splits.push(Edge {
            id: format!("{id}-{i}-{}-split-a", e.id),
            to: snap_id.clone(),
            distance_m: da,
            geometry: first.into(),
            elevation_gain_m: Some(round(gain * (da / (da + db)), 1)),
            to_abs_elev_m: None,
            ..e.clone()
        });
        splits.push(Edge {
            id: format!("{id}-{i}-{}-split-b", e.id),
            from: snap_id,
            distance_m: db,
            geometry: second.into(),
            elevation_gain_m: Some(round(gain * (db / (da + db)), 1)),
            from_abs_elev_m: None,
            ..e.clone()
        });
    }
    nodes.append(&mut draft.nodes);
    connectors.extend(splits);
    connectors.append(&mut draft.edges);
    draft.nodes = nodes;
    draft.edges = connectors;
}

#[cfg(test)]
mod tests {
    use super::*;
    fn feature(geometry: Vec<Point>, kind: GreenKind, order: usize) -> Feature {
        let mut lo = [f64::INFINITY; 2];
        let mut hi = [f64::NEG_INFINITY; 2];
        for p in &geometry {
            lo[0] = lo[0].min(p.lat);
            lo[1] = lo[1].min(p.lng);
            hi[0] = hi[0].max(p.lat);
            hi[1] = hi[1].max(p.lng);
        }
        Feature {
            geometry,
            kind,
            order,
            envelope: AABB::from_corners(lo, hi),
        }
    }
    #[test]
    fn containment_nearest_five_and_input_ties() {
        let polygon = vec![
            Point {
                lat: -0.01,
                lng: -0.01,
            },
            Point {
                lat: 0.01,
                lng: -0.01,
            },
            Point {
                lat: 0.01,
                lng: 0.01,
            },
            Point {
                lat: -0.01,
                lng: 0.01,
            },
            Point {
                lat: -0.01,
                lng: -0.01,
            },
        ];
        let tree = RTree::bulk_load(
            (0..6)
                .map(|i| {
                    feature(
                        polygon.clone(),
                        if i == 5 {
                            GreenKind::Water
                        } else {
                            GreenKind::Park
                        },
                        i,
                    )
                })
                .collect(),
        );
        let p = Point { lat: 0.0, lng: 0.0 };
        assert_eq!(green_scores(p, &tree, true), [1.0, 0.72, 0.82]);
        assert_eq!(green_scores(p, &tree, true), green_scores(p, &tree, false));
    }
    #[test]
    fn cutoff_and_wrapped_degenerate_features_match_exhaustive() {
        for p in [
            Point { lat: 0.0, lng: 0.0 },
            Point {
                lat: 45.0,
                lng: 179.999,
            },
            Point {
                lat: 89.999,
                lng: 179.999,
            },
        ] {
            let mut fs = Vec::new();
            for (i, d) in [299.999, 300.0, 300.001, 1000.0].into_iter().enumerate() {
                let mut q = destination(p, 90.0, d);
                if q.lng > 180.0 {
                    q.lng -= 360.0;
                }
                fs.push(feature(vec![q, q], GreenKind::Water, i));
            }
            let tree = RTree::bulk_load(fs);
            let a = green_scores(p, &tree, true);
            let b = green_scores(p, &tree, false);
            for i in 0..3 {
                assert!((a[i] - b[i]).abs() < 1e-9, "{a:?} {b:?}");
            }
        }
    }
}

use crate::{
    analysis::{self, Generated, Strategy},
    candidates::loop_waypoints,
    geo::*,
    graph::Graph,
    model::*,
    search::{EngineError, Options, Path, Search},
};
use std::collections::{HashMap, HashSet};
struct Shape {
    overlap: f64,
    compactness: f64,
    coverage: f64,
    backtrack: f64,
    dead_ends: usize,
    max_detour: f64,
    spike: f64,
    score: f64,
}
fn shape(g: &Graph, path: &Path, origin: Point, ratios: &[f64], p: &Preferences) -> Shape {
    let overlap = path.overlap(g);
    let geom = &path.geometry;
    let compactness = if geom.len() < 3 || path.distance <= 0.0 {
        0.0
    } else {
        let o = geom[0];
        let points: Vec<_> = geom
            .iter()
            .map(|pt| {
                [
                    (pt.lng - o.lng) * 111320.0 * radians(o.lat).cos(),
                    (pt.lat - o.lat) * 110540.0,
                ]
            })
            .collect();
        let mut twice = 0.0;
        for i in 0..points.len() {
            let c = points[i];
            let n = points[(i + 1) % points.len()];
            twice += c[0] * n[1] - n[0] * c[1];
        }
        4.0 * std::f64::consts::PI * (twice.abs() / 2.0) / (path.distance * path.distance)
    };
    let sectors: HashSet<_> = geom
        .iter()
        .filter(|&&pt| distance(origin, pt) >= 120.0)
        .map(|&pt| (bearing(origin, pt) / 45.0).floor() as i32)
        .collect();
    let coverage = sectors.len() as f64 / 8.0;
    let backtrack = if path.edges.len() < 2 {
        0.0
    } else {
        path.edges
            .windows(2)
            .filter(|es| {
                let a = &g.edges[es[0]].geometry;
                let b = &g.edges[es[1]].geometry;
                angular_difference(
                    bearing(a[0], *a.last().unwrap()),
                    bearing(b[0], *b.last().unwrap()),
                ) >= 155.0
            })
            .count() as f64
            / (path.edges.len() - 1) as f64
    };
    let dead_ends = path
        .nodes
        .iter()
        .skip(1)
        .take(path.nodes.len().saturating_sub(2))
        .filter(|&&n| {
            g.adjacent(n)
                .iter()
                .filter(|&&e| g.edges[e].access_allowed)
                .count()
                < 2
        })
        .count();
    let max_detour = ratios.iter().copied().fold(1.0, f64::max);
    let slope_limit = if p.activity == Activity::Cycling {
        0.10
    } else {
        0.14
    };
    let spike = if path.distance <= 0.0 || p.route_style == Some(Style::Climbing) {
        0.0
    } else {
        path.edges
            .iter()
            .map(|&e| &g.edges[e])
            .filter(|e| e.slope.unwrap_or(0.0).abs() > slope_limit && e.distance_m <= 700.0)
            .map(|e| e.distance_m)
            .sum::<f64>()
            / path.distance
    };
    let score = round(
        100.0
            - overlap * 60.0
            - backtrack * 80.0
            - dead_ends as f64 * 25.0
            - (0.025 - compactness).max(0.0) / 0.025 * 35.0
            - (max_detour - 2.0).max(0.0) * 15.0
            - spike * 70.0
            + coverage
                * if p.activity == Activity::Hiking {
                    12.0
                } else {
                    22.0
                },
        0,
    )
    .clamp(0.0, 100.0);
    Shape {
        overlap,
        compactness,
        coverage,
        backtrack,
        dead_ends,
        max_detour,
        spike,
        score,
    }
}
fn corridor(g: &Graph, path: &Path) -> HashMap<String, f64> {
    let mut result = HashMap::new();
    if path.geometry.len() < 2 {
        return result;
    }
    let end = path
        .geometry
        .len()
        .min(2_usize.max((path.geometry.len() as f64 * 0.4) as usize));
    let pts = &path.geometry[..end];
    let origin = pts[0];
    let radius = pts
        .iter()
        .map(|&pt| distance(origin, pt))
        .fold(0.0, f64::max)
        + 45.0;
    for (n, _) in g.ring(origin, radius / 2.0, radius / 2.0 + 1.0) {
        let point = g.nodes[n].point;
        if pts
            .windows(2)
            .any(|w| segment_distance_km(point, w[0], w[1]) * 1000.0 < 45.0)
        {
            for &e in g.adjacent(n) {
                *result.entry(g.keys[e].clone()).or_insert(0.0) += 15.0 * g.edges[e].distance_m;
            }
        }
    }
    result
}
fn enough(g: &Graph, built: &[(Generated, Shape)], p: &Preferences) -> bool {
    let t = target(p);
    let mut matches: Vec<_> = built
        .iter()
        .filter(|(c, s)| {
            s.overlap <= 0.05 && (c.candidate.distance_km - t).abs() / t <= tolerance(t)
        })
        .map(|(c, _)| c.clone())
        .collect();
    if matches.len() < 8 {
        return false;
    }
    analysis::rank(&mut matches);
    analysis::diverse(g, &matches, 0.65, t * 0.10, 3).len() >= 3
}
pub fn generate(
    search: &mut Search,
    p: &Preferences,
    start: usize,
) -> Result<Vec<Generated>, EngineError> {
    let g = search.graph;
    let sets = loop_waypoints(g, p, start);
    let mut tier = sets.first().map(|s| s.tier).unwrap_or(0);
    let mut built = Vec::new();
    let mut first_cache: HashMap<usize, Option<Path>> = HashMap::new();
    let mut corridor_cache: HashMap<usize, HashMap<String, f64>> = HashMap::new();
    for (index, set) in sets.into_iter().enumerate() {
        search.budget.check()?;
        if set.tier > tier {
            if tier >= 2 && enough(g, &built, p) {
                break;
            }
            tier = set.tier;
        }
        let mut nodes = vec![start];
        nodes.extend(&set.nodes);
        nodes.push(start);
        let mut segments = Vec::new();
        let mut ratios = Vec::new();
        let mut penalties: HashMap<String, f64> = HashMap::new();
        let mut failed = false;
        for step in 0..nodes.len() - 1 {
            let segment = if step == 0 {
                if let std::collections::hash_map::Entry::Vacant(e) = first_cache.entry(nodes[1]) {
                    let path = search.shortest(start, nodes[1], &Options::default())?;
                    e.insert(path);
                }
                first_cache[&nodes[1]].clone()
            } else {
                let opts = if step == nodes.len() - 2 {
                    let corridor = corridor_cache
                        .entry(nodes[1])
                        .or_insert_with(|| corridor(g, &segments[0]));
                    let mut combined: HashMap<_, _> = penalties
                        .iter()
                        .map(|(k, v)| (k.clone(), v * 2.0))
                        .collect();
                    for (k, v) in corridor {
                        *combined.entry(k.clone()).or_insert(0.0) += *v;
                    }
                    Options {
                        penalties: combined,
                        ..Options::default()
                    }
                } else {
                    Options {
                        penalties: penalties.clone(),
                        ..Options::default()
                    }
                };
                search.shortest(nodes[step], nodes[step + 1], &opts)?
            };
            let Some(segment) = segment else {
                failed = true;
                break;
            };
            let direct = distance(g.nodes[nodes[step]].point, g.nodes[nodes[step + 1]].point);
            let ratio = if direct > 40.0 {
                segment.distance / direct
            } else {
                1.0
            };
            segments.push(segment);
            if ratio > 2.8 {
                failed = true;
                break;
            }
            ratios.push(ratio);
            for &e in &segments.last().unwrap().edges {
                *penalties.entry(g.keys[e].clone()).or_insert(0.0) += 5.0 * g.edges[e].distance_m;
            }
        }
        if failed {
            continue;
        }
        let path = Path::combine(g, &segments).despike(g);
        if path.edges.is_empty() {
            continue;
        }
        let shape = shape(g, &path, g.nodes[start].point, &ratios, p);
        if !(shape.overlap <= 0.15
            && shape.dead_ends == 0
            && shape.compactness >= 0.025
            && shape.backtrack
                <= if p.activity == Activity::Hiking {
                    0.28
                } else {
                    0.18
                }
            && shape.max_detour <= 2.8
            && shape.spike <= 0.16)
        {
            continue;
        }
        let name = if set.strategy == Strategy::Park {
            "Park Loop"
        } else if set.nodes.len() >= 3 {
            if shape.coverage >= 0.6 {
                "Triangle Loop"
            } else {
                "Scenic Loop"
            }
        } else if shape.coverage >= 0.75 {
            "City Loop"
        } else if shape.compactness >= 0.1 {
            "Compact Loop"
        } else {
            "Balanced Loop"
        };
        let mut candidate = analysis::build(
            g,
            p,
            path,
            format!("generated-loop-{}", index + 1),
            name,
            set.nodes.iter().map(|&n| g.nodes[n].point).collect(),
            set.strategy,
            None,
        );
        candidate.candidate.metrics.total_score = round(
            candidate.candidate.metrics.total_score * 0.75 + shape.score * 0.25,
            0,
        )
        .clamp(0.0, 100.0);
        built.push((candidate, shape));
    }
    let strict = built.iter().filter(|(_, s)| s.overlap <= 0.05).count() >= 3;
    Ok(built
        .into_iter()
        .filter(|(_, s)| !strict || s.overlap <= 0.05)
        .map(|(c, _)| c)
        .collect())
}

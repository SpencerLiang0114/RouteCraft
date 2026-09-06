use crate::{
    analysis::{self, Generated, Strategy},
    geo::*,
    graph::Graph,
    model::*,
    search::{Budget, EngineError, Options, Path, Search},
};
use std::collections::{HashMap, HashSet};
pub fn quality(g: &Graph, n: usize, p: &Preferences) -> f64 {
    let es = g.adjacent(n);
    if es.is_empty() {
        return 0.0;
    }
    let mut total = 0.0;
    for &e in es {
        let e = &g.edges[e];
        if !e.access_allowed {
            total -= 3.0;
            continue;
        }
        total += e.park_score * normalize(p.park_preference)
            + e.shade_score * normalize(p.shade_preference)
            + e.safety_score * normalize(p.safety_preference)
            + e.novelty_score.unwrap_or(e.scenery_score) * normalize(p.exploration_preference)
            + e.scenery_score * 0.4
            + if p.activity == Activity::Cycling {
                e.bike_score
            } else {
                e.walk_score
            };
    }
    total / es.len() as f64
}
#[derive(Clone)]
pub struct Waypoints {
    pub nodes: Vec<usize>,
    pub strategy: Strategy,
    pub tier: usize,
}
fn nondegenerate(p: Point, a: Point, b: Point) -> bool {
    angular_difference(bearing(p, a), bearing(p, b)) >= 25.0
}
fn pick(
    g: &Graph,
    point: Point,
    r: f64,
    p: &Preferences,
    excluded: &HashSet<usize>,
) -> Option<usize> {
    let mut best = None;
    let mut score = f64::NEG_INFINITY;
    for (n, d) in g.ring(point, r / 2.0, r / 2.0 + 1.0) {
        if excluded.contains(&n) || g.adjacent(n).len() < 2 || d > r {
            continue;
        }
        let s = quality(g, n, p) - d / r * 0.1;
        if s > score {
            score = s;
            best = Some(n);
        }
    }
    best
}
pub fn loop_waypoints(g: &Graph, p: &Preferences, start: usize) -> Vec<Waypoints> {
    let r = (target(p) * 1000.0 / 5.2).max(400.0);
    let origin = g.nodes[start].point;
    let mut sectors: Vec<Vec<(usize, f64)>> = vec![Vec::new(); 8];
    for &n in &g.iteration {
        if n == start || g.adjacent(n).len() < 2 {
            continue;
        }
        let point = g.nodes[n].point;
        let d = distance(origin, point);
        if d < r * 0.55 || d > r * 1.55 {
            continue;
        }
        let sector = (bearing(origin, point) / 45.0) as usize % 8;
        let q = quality(g, n, p) - (d - r).abs() / r * 0.4;
        sectors[sector].push((n, q));
    }
    for bucket in &mut sectors {
        bucket.sort_by(|a, b| {
            b.1.total_cmp(&a.1)
                .then(g.nodes[b.0].id.cmp(&g.nodes[a.0].id))
        });
        bucket.truncate(4);
    }
    let valid = |pivot: usize, a: usize, b: usize| {
        nondegenerate(g.nodes[pivot].point, g.nodes[a].point, g.nodes[b].point)
    };
    let mut sets = Vec::new();
    for (count, step) in [(4, 4), (8, 2)] {
        for i in 0..count {
            for (ri, &(a, _)) in sectors[i].iter().enumerate() {
                for (rj, &(b, _)) in sectors[(i + step) % 8].iter().enumerate() {
                    if a != b && valid(start, a, b) {
                        sets.push(Waypoints {
                            nodes: vec![a, b],
                            strategy: if step == 4 && i % 2 == 0 {
                                Strategy::Recommended
                            } else {
                                Strategy::Exploration
                            },
                            tier: ri.max(rj) + 1,
                        });
                    }
                }
            }
        }
    }
    for i in 0..8 {
        let a = &sectors[i];
        let b = &sectors[(i + 2) % 8];
        let c = &sectors[(i + 4) % 8];
        if a.is_empty() || b.is_empty() || c.is_empty() {
            continue;
        }
        let first = a[0].0;
        let second = b[0].0;
        let third = c[0].0;
        if first == second
            || first == third
            || second == third
            || !valid(start, first, second)
            || !valid(start, first, third)
            || !valid(second, first, third)
        {
            continue;
        }
        sets.push(Waypoints {
            nodes: vec![first, second, third],
            strategy: Strategy::Park,
            tier: 1,
        });
        if a.len() > 1 {
            let alt = a[1].0;
            if alt != second
                && alt != third
                && valid(start, alt, second)
                && valid(start, alt, third)
            {
                sets.push(Waypoints {
                    nodes: vec![alt, second, third],
                    strategy: Strategy::Park,
                    tier: 2,
                });
            }
        }
    }
    if sets.len() < 6 {
        for scale in [0.85, 1.0, 1.15] {
            let r = r * scale;
            for b in [0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0] {
                let mut excluded = HashSet::from([start]);
                let Some(a) = pick(g, destination(origin, b, r * 0.90), r * 0.35, p, &excluded)
                else {
                    continue;
                };
                excluded.insert(a);
                let Some(second) = pick(
                    g,
                    destination(origin, (b + 120.0) % 360.0, r),
                    r * 0.35,
                    p,
                    &excluded,
                ) else {
                    continue;
                };
                if valid(start, a, second) {
                    sets.push(Waypoints {
                        nodes: vec![a, second],
                        strategy: Strategy::Recommended,
                        tier: 5,
                    });
                }
            }
        }
    }
    sets.sort_by_key(|s| s.tier);
    sets
}
pub fn generate(g: &Graph, p: &Preferences, budget: Budget) -> Result<Vec<Candidate>, EngineError> {
    let mut search = Search::new(g, p, budget);
    let start = g
        .nearest(start(p))
        .ok_or(EngineError::InsufficientGraphData)?;
    let raw = match p.route_type {
        RouteType::Loop => crate::loops::generate(&mut search, p, start)?,
        RouteType::OutAndBack => out_and_back(&mut search, p, start)?,
        RouteType::PointToPoint => point_to_point(&mut search, p, start)?,
    };
    search.budget.check()?;
    Ok(analysis::select(g, p, raw))
}
fn out_and_back(
    search: &mut Search,
    p: &Preferences,
    start: usize,
) -> Result<Vec<Generated>, EngineError> {
    let g = search.graph;
    let tree = search.tree(start)?;
    let target = target(p) * 1000.0;
    let outbound = target / 2.0;
    let cap = (outbound * 0.25).max(400.0);
    // Match the reference's HashMap iteration, including insertion order within buckets.
    let mut order: Vec<Node> = tree.discovery.iter().map(|&n| g.nodes[n].clone()).collect();
    let capacity = (order.len() * 4).div_ceil(3);
    crate::osm::java_node_order(&mut order, capacity);
    let mut choices: Vec<(usize, f64, f64)> = Vec::new();
    for (lo, hi) in [(0.0, cap), (cap, (outbound * 0.5).max(800.0))] {
        if lo > 0.0 && choices.len() >= 5 {
            break;
        }
        for node in &order {
            let n = g.indices[&node.id];
            if n == start || g.adjacent(n).len() < 2 {
                continue;
            }
            let error = (tree.distances[n] - outbound).abs();
            if error > hi || (lo > 0.0 && error <= lo) {
                continue;
            }
            let b = bearing(g.nodes[start].point, node.point);
            let score = (1.0 - error / hi) * 3.0
                + quality(g, n, p)
                + normalize(p.exploration_preference) * angular_difference(b, 45.0) * -0.004;
            choices.push((n, score, error));
        }
    }
    crate::compat_sort::sort(&mut choices, |a, b| {
        if (a.2 - b.2).abs() < 150.0 {
            b.1.total_cmp(&a.1)
        } else {
            a.2.total_cmp(&b.2)
        }
    });
    choices.truncate(30);
    let mut built: Vec<_> = choices
        .into_iter()
        .filter_map(|(n, _, _)| {
            tree.path(g, n).map(|path| {
                let error = (path.distance * 2.0 - target).abs();
                (path, n, error)
            })
        })
        .collect();
    built.sort_by(|a, b| a.2.total_cmp(&b.2));
    Ok(built
        .into_iter()
        .enumerate()
        .map(|(i, (out, n, _))| {
            let reverse = out.reverse(g);
            let path = Path::combine(g, &[out, reverse]);
            analysis::build(
                g,
                p,
                path,
                format!("generated-out-back-{}", i + 1),
                "Out and Back",
                vec![g.nodes[n].point],
                Strategy::Recommended,
                None,
            )
        })
        .collect())
}
fn point_to_point(
    search: &mut Search,
    p: &Preferences,
    start: usize,
) -> Result<Vec<Generated>, EngineError> {
    let g = search.graph;
    let target = target(p) * 1000.0;
    let end_point = p
        .end_point
        .unwrap_or_else(|| destination(crate::geo::start(p), 65.0, target * 0.7));
    let Some(end) = g.nearest(end_point) else {
        return Ok(vec![]);
    };
    if start == end {
        return Ok(vec![]);
    }
    let paths = search.diverse(start, end, 8)?;
    let reference: Option<HashSet<String>> = paths
        .first()
        .map(|p| p.edges.iter().map(|&e| g.keys[e].clone()).collect());
    let direct_count = paths.len();
    let mut all = paths;
    if all
        .first()
        .is_some_and(|first| target > first.distance * 1.2)
    {
        let mut choices: Vec<_> = g
            .iteration
            .iter()
            .filter(|&&n| n != start && n != end)
            .filter_map(|&n| {
                let d = distance(g.nodes[start].point, g.nodes[n].point)
                    + distance(g.nodes[n].point, g.nodes[end].point);
                ((d - target).abs() <= target * 0.45).then_some((n, d))
            })
            .collect();
        choices.sort_by(|a, b| (a.1 - target).abs().total_cmp(&(b.1 - target).abs()));
        choices.truncate(18);
        let mut detours = Vec::new();
        let mut matching = 0;
        for (i, (n, _)) in choices.iter().enumerate() {
            let Some(first) = search.shortest(
                start,
                *n,
                &Options {
                    blocked_nodes: HashSet::from([end]),
                    ..Options::default()
                },
            )?
            else {
                continue;
            };
            let mut penalties = HashMap::new();
            for &e in &first.edges {
                penalties.insert(g.keys[e].clone(), g.edges[e].distance_m * 0.6);
            }
            let Some(second) = search.shortest(
                *n,
                end,
                &Options {
                    blocked_nodes: HashSet::from([start]),
                    penalties,
                    ..Options::default()
                },
            )?
            else {
                continue;
            };
            let path = Path::combine(g, &[first, second]);
            if (path.distance - target).abs() <= target * tolerance(target / 1000.0) {
                matching += 1;
            }
            detours.push(path);
            if (i + 1) % 4 == 0 && matching >= 4 {
                break;
            }
        }
        detours.sort_by(|a, b| {
            (a.distance - target)
                .abs()
                .total_cmp(&(b.distance - target).abs())
        });
        detours.truncate(8);
        all.extend(detours);
    }
    Ok(all
        .into_iter()
        .enumerate()
        .map(|(i, path)| {
            let detour = i >= direct_count;
            let strategy = if i == 0 {
                Strategy::Direct
            } else if detour || i % 2 == 0 {
                Strategy::Exploration
            } else {
                Strategy::Recommended
            };
            let name = if i == 0 {
                "Efficient Connector"
            } else if detour {
                "Target-Distance Detour"
            } else {
                "Alternative Connector"
            };
            analysis::build(
                g,
                p,
                path,
                format!("generated-point-{}", i + 1),
                name,
                vec![g.nodes[end].point],
                strategy,
                if i == 0 { None } else { reference.as_ref() },
            )
        })
        .collect())
}

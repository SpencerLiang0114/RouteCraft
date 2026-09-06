use crate::{geo::*, graph::Graph, model::*};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct Budget {
    end: Instant,
    cancelled: Arc<AtomicBool>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineError {
    InsufficientGraphData,
    NoRoute,
    ExpiredHandle,
    Overload,
    Timeout,
    MalformedInput,
}
impl Budget {
    pub fn new(duration: Duration) -> Self {
        Self {
            end: Instant::now() + duration,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn check(&self) -> Result<(), EngineError> {
        if Instant::now() >= self.end || self.cancelled.load(Ordering::Relaxed) {
            Err(EngineError::Timeout)
        } else {
            Ok(())
        }
    }
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }
}
#[derive(Clone, Default)]
pub struct Options {
    pub blocked_edges: HashSet<String>,
    pub blocked_nodes: HashSet<usize>,
    pub penalties: HashMap<String, f64>,
}
#[derive(Clone, Debug)]
pub struct Path {
    pub nodes: Vec<usize>,
    pub edges: Vec<usize>,
    pub geometry: Vec<Point>,
    pub distance: f64,
    pub cost: f64,
}
impl Path {
    pub fn from_edges(g: &Graph, nodes: Vec<usize>, edges: Vec<usize>, cost: f64) -> Self {
        let mut geometry = Vec::new();
        for (i, &e) in edges.iter().enumerate() {
            geometry.extend(g.edges[e].geometry.iter().skip(usize::from(i > 0)).copied());
        }
        if geometry.is_empty()
            && let Some(&n) = nodes.first()
        {
            geometry.push(g.nodes[n].point);
        }
        let distance = edges.iter().map(|&e| g.edges[e].distance_m).sum();
        Self {
            nodes,
            edges,
            geometry,
            distance,
            cost,
        }
    }
    pub fn combine(g: &Graph, paths: &[Self]) -> Self {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut cost = 0.0;
        for (i, p) in paths.iter().enumerate() {
            nodes.extend(p.nodes.iter().skip(usize::from(i > 0)));
            edges.extend(&p.edges);
            cost += p.cost;
        }
        Self::from_edges(g, nodes, edges, cost)
    }
    pub fn reverse(&self, g: &Graph) -> Self {
        Self::from_edges(
            g,
            self.nodes.iter().rev().copied().collect(),
            self.edges.iter().rev().map(|&e| e ^ 1).collect(),
            self.cost,
        )
    }
    pub fn despike(&self, g: &Graph) -> Self {
        let mut stack: Vec<usize> = Vec::new();
        for &e in &self.edges {
            if stack
                .last()
                .is_some_and(|&a| g.from[a] == g.to[e] && g.to[a] == g.from[e])
            {
                stack.pop();
            } else {
                stack.push(e);
            }
        }
        if stack.len() == self.edges.len() {
            return self.clone();
        }
        if stack.is_empty() {
            return Self::from_edges(g, vec![self.nodes[0]], vec![], 0.0);
        }
        let mut nodes = vec![g.from[stack[0]]];
        nodes.extend(stack.iter().map(|&e| g.to[e]));
        let d: f64 = stack.iter().map(|&e| g.edges[e].distance_m).sum();
        Self::from_edges(
            g,
            nodes,
            stack,
            if self.distance > 0.0 {
                self.cost * (d / self.distance)
            } else {
                0.0
            },
        )
    }
    pub fn overlap(&self, g: &Graph) -> f64 {
        if self.distance <= 0.0 {
            return 0.0;
        }
        let mut count = HashMap::new();
        for &e in &self.edges {
            *count.entry(&g.keys[e]).or_insert(0) += 1;
        }
        self.edges
            .iter()
            .filter(|&&e| count[&g.keys[e]] > 1)
            .map(|&e| g.edges[e].distance_m)
            .sum::<f64>()
            / self.distance
    }
    fn signature(&self, g: &Graph) -> Vec<String> {
        self.edges.iter().map(|&e| g.keys[e].clone()).collect()
    }
}
// Java PriorityQueue's equal-priority behavior (no extra ordinal tiebreaker).
#[derive(Default)]
struct Queue(Vec<(usize, f64)>);
impl Queue {
    fn push(&mut self, x: (usize, f64)) {
        let mut i = self.0.len();
        self.0.push(x);
        while i > 0 {
            let p = (i - 1) / 2;
            if x.1 >= self.0[p].1 {
                break;
            }
            self.0[i] = self.0[p];
            i = p;
        }
        self.0[i] = x;
    }
    fn pop(&mut self) -> Option<(usize, f64)> {
        let result = *self.0.first()?;
        let x = self.0.pop().unwrap();
        if !self.0.is_empty() {
            let mut k = 0;
            let half = self.0.len() / 2;
            while k < half {
                let mut c = 2 * k + 1;
                if c + 1 < self.0.len() && self.0[c].1 > self.0[c + 1].1 {
                    c += 1;
                }
                if x.1 <= self.0[c].1 {
                    break;
                }
                self.0[k] = self.0[c];
                k = c;
            }
            self.0[k] = x;
        }
        Some(result)
    }
}
pub struct Search<'a> {
    pub graph: &'a Graph,
    costs: Vec<f64>,
    pub budget: Budget,
    cost: Vec<f64>,
    distance: Vec<f64>,
    prev: Vec<usize>,
    settled: Vec<bool>,
    queue: Queue,
}
#[derive(Clone)]
pub struct Tree {
    start: usize,
    pub distances: Vec<f64>,
    cost: Vec<f64>,
    prev: Vec<usize>,
    pub discovery: Vec<usize>,
}
fn reconstruct(g: &Graph, start: usize, end: usize, prev: &[usize], cost: f64) -> Path {
    let mut edges = Vec::new();
    let mut nodes = vec![end];
    let mut current = end;
    while current != start {
        let e = prev[current];
        if e == usize::MAX || edges.len() > g.nodes.len() {
            return Path::from_edges(g, vec![start], vec![], 0.0);
        }
        edges.push(e);
        current = g.from[e];
        nodes.push(current);
    }
    edges.reverse();
    nodes.reverse();
    Path::from_edges(g, nodes, edges, cost)
}
impl Tree {
    pub fn path(&self, g: &Graph, end: usize) -> Option<Path> {
        self.cost[end]
            .is_finite()
            .then(|| reconstruct(g, self.start, end, &self.prev, self.cost[end]))
    }
}
impl<'a> Search<'a> {
    pub fn new(graph: &'a Graph, p: &Preferences, budget: Budget) -> Self {
        let n = graph.nodes.len();
        Self {
            graph,
            costs: graph
                .edges
                .iter()
                .map(|e| crate::graph::edge_cost(e, p))
                .collect(),
            budget,
            cost: vec![f64::INFINITY; n],
            distance: vec![f64::INFINITY; n],
            prev: vec![usize::MAX; n],
            settled: vec![false; n],
            queue: Queue::default(),
        }
    }
    fn reset(&mut self, start: usize) {
        self.cost.fill(f64::INFINITY);
        self.distance.fill(f64::INFINITY);
        self.prev.fill(usize::MAX);
        self.settled.fill(false);
        self.queue.0.clear();
        self.cost[start] = 0.0;
        self.distance[start] = 0.0;
        self.queue.push((start, 0.0));
    }
    pub fn shortest(
        &mut self,
        start: usize,
        end: usize,
        o: &Options,
    ) -> Result<Option<Path>, EngineError> {
        self.budget.check()?;
        self.reset(start);
        let g = self.graph;
        while let Some((current, _)) = self.queue.pop() {
            self.budget.check()?;
            if self.settled[current] {
                continue;
            }
            self.settled[current] = true;
            if current == end {
                return Ok(Some(reconstruct(g, start, end, &self.prev, self.cost[end])));
            }
            for &e in g.adjacent(current) {
                let to = g.to[e];
                let edge = &g.edges[e];
                if o.blocked_edges.contains(&edge.id)
                    || o.blocked_edges.contains(&g.keys[e])
                    || (to != end && o.blocked_nodes.contains(&to))
                {
                    continue;
                }
                let cost = self.costs[e];
                if !cost.is_finite() {
                    continue;
                }
                let penalty = o
                    .penalties
                    .get(&edge.id)
                    .or_else(|| o.penalties.get(&g.keys[e]))
                    .copied()
                    .unwrap_or(0.0);
                let next = self.cost[current] + cost + penalty;
                if next < self.cost[to] {
                    self.cost[to] = next;
                    self.prev[to] = e;
                    self.queue.push((
                        to,
                        next + distance(g.nodes[to].point, g.nodes[end].point) * 0.2,
                    ));
                }
            }
        }
        Ok(None)
    }
    pub fn tree(&mut self, start: usize) -> Result<Tree, EngineError> {
        self.reset(start);
        let mut discovery = vec![start];
        let g = self.graph;
        while let Some((current, _)) = self.queue.pop() {
            self.budget.check()?;
            if self.settled[current] {
                continue;
            }
            self.settled[current] = true;
            for &e in g.adjacent(current) {
                let cost = self.costs[e];
                if !cost.is_finite() {
                    continue;
                }
                let next = self.cost[current] + cost;
                let to = g.to[e];
                if next < self.cost[to] {
                    if !self.cost[to].is_finite() {
                        discovery.push(to);
                    }
                    self.cost[to] = next;
                    self.distance[to] = self.distance[current] + g.edges[e].distance_m;
                    self.prev[to] = e;
                    self.queue.push((to, next));
                }
            }
        }
        Ok(Tree {
            start,
            distances: self.distance.clone(),
            cost: self.cost.clone(),
            prev: self.prev.clone(),
            discovery,
        })
    }
    pub fn diverse(
        &mut self,
        start: usize,
        end: usize,
        max: usize,
    ) -> Result<Vec<Path>, EngineError> {
        let mut result = Vec::new();
        let mut signatures = HashSet::new();
        let mut o = Options::default();
        for _ in 0..max + 3 {
            if result.len() >= max {
                break;
            }
            let Some(path) = self.shortest(start, end, &o)? else {
                break;
            };
            if signatures.insert(path.signature(self.graph)) {
                result.push(path.clone());
            }
            for &e in &path.edges {
                *o.penalties.entry(self.graph.keys[e].clone()).or_insert(0.0) +=
                    self.graph.edges[e].distance_m * 0.75;
            }
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn graph() -> Graph {
        let points = [
            Point {
                lat: 40.0,
                lng: -74.0,
            },
            Point {
                lat: 40.001,
                lng: -74.0,
            },
            Point {
                lat: 40.001,
                lng: -73.999,
            },
            Point {
                lat: 40.0,
                lng: -73.999,
            },
            Point {
                lat: 45.0,
                lng: 0.0,
            },
        ];
        let nodes = points
            .iter()
            .enumerate()
            .map(|(i, &point)| Node {
                id: i.to_string(),
                point,
            })
            .collect();
        let edges = [(0, 1, 100.0), (1, 2, 100.0), (0, 3, 140.0), (3, 2, 140.0)]
            .iter()
            .enumerate()
            .map(|(i, &(a, b, d))| Edge {
                id: format!("edge-{i}"),
                from: a.to_string(),
                to: b.to_string(),
                distance_m: d,
                geometry: vec![points[a], points[b]].into(),
                surface_type: "paved".into(),
                road_type: "residential".into(),
                elevation_gain_m: Some(0.0),
                from_abs_elev_m: None,
                to_abs_elev_m: None,
                slope: Some(0.0),
                park_score: 0.0,
                shade_score: 0.5,
                safety_score: 0.7,
                scenery_score: 0.5,
                bike_score: 0.5,
                walk_score: 0.7,
                access_allowed: true,
                novelty_score: Some(0.5),
                traffic_exposure: Some(0.1),
                access_restrictions: None,
            })
            .collect();
        Graph::new(Draft { nodes, edges })
    }
    fn prefs() -> Preferences {
        serde_json::from_value(serde_json::json!({"activity":"running","routeType":"point_to_point","parkPreference":0.0,"shadePreference":0.0,"safetyPreference":0.0,"elevationPreference":0.0,"explorationPreference":0.0})).unwrap()
    }
    #[test]
    fn blocked_nodes_edges_and_reverse_penalties() {
        let g = graph();
        let mut search = Search::new(&g, &prefs(), Budget::new(Duration::from_secs(1)));
        assert_eq!(
            search
                .shortest(0, 2, &Options::default())
                .unwrap()
                .unwrap()
                .nodes,
            vec![0, 1, 2]
        );
        assert_eq!(
            search
                .shortest(
                    0,
                    2,
                    &Options {
                        blocked_nodes: HashSet::from([1]),
                        ..Options::default()
                    }
                )
                .unwrap()
                .unwrap()
                .nodes,
            vec![0, 3, 2]
        );
        assert_eq!(
            search
                .shortest(
                    2,
                    0,
                    &Options {
                        blocked_edges: HashSet::from([edge_key("0", "1")]),
                        ..Options::default()
                    }
                )
                .unwrap()
                .unwrap()
                .nodes,
            vec![2, 3, 0]
        );
        let penalties = HashMap::from([(edge_key("0", "1"), 10000.0)]);
        assert_eq!(
            search
                .shortest(
                    2,
                    0,
                    &Options {
                        penalties,
                        ..Options::default()
                    }
                )
                .unwrap()
                .unwrap()
                .nodes,
            vec![2, 3, 0]
        );
        assert!(
            search
                .shortest(0, 4, &Options::default())
                .unwrap()
                .is_none()
        );
        assert_eq!(
            search
                .shortest(0, 0, &Options::default())
                .unwrap()
                .unwrap()
                .distance,
            0.0
        );
        let tree = search.tree(0).unwrap();
        assert_eq!(tree.path(&g, 2).unwrap().nodes, vec![0, 1, 2]);
        assert!(tree.path(&g, 4).is_none());
    }
    #[test]
    fn cancellation_deadline_and_alternative_budget() {
        let g = graph();
        let budget = Budget::new(Duration::from_secs(1));
        budget.cancel();
        assert!(matches!(
            Search::new(&g, &prefs(), budget).shortest(0, 2, &Options::default()),
            Err(EngineError::Timeout)
        ));
        assert!(matches!(
            Search::new(&g, &prefs(), Budget::new(Duration::ZERO)).tree(0),
            Err(EngineError::Timeout)
        ));
        let mut search = Search::new(&g, &prefs(), Budget::new(Duration::from_secs(1)));
        assert!(search.diverse(0, 2, 0).unwrap().is_empty());
        let paths = search.diverse(0, 2, 2).unwrap();
        assert_eq!(paths.len(), 2);
        assert_ne!(paths[0].nodes, paths[1].nodes);
    }
}

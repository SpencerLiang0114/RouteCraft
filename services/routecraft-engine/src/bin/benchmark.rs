use routecraft_engine::{candidates, graph::Graph, model::*, osm, search::Budget};
use std::{
    io::{self, BufRead},
    time::{Duration, Instant},
};
fn main() {
    // One JSON input per line lets the coordinator warm and sample identical fixtures.
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let input: serde_json::Value = serde_json::from_str(&line).unwrap();
        let elements: Vec<OsmElement> = serde_json::from_value(input["elements"].clone()).unwrap();
        let p: Preferences = serde_json::from_value(input["preferences"].clone()).unwrap();
        let elevations = serde_json::from_value(input["elevations"].clone()).unwrap();
        let supplied: Option<Draft> = input
            .get("draft")
            .map(|v| serde_json::from_value(v.clone()).unwrap());
        #[cfg(feature = "profiling")]
        routecraft_engine::profiling::COUNTERS.with(|c| *c.borrow_mut() = Default::default());
        let t = Instant::now();
        let mut draft = osm::trim(
            supplied.unwrap_or_else(|| osm::create_edges(&elements, &p, true)),
            &p,
        );
        let prepare = t.elapsed().as_secs_f64() * 1000.0;
        let t = Instant::now();
        osm::apply_elevations(&mut draft, &elevations);
        osm::anchor(&mut draft, "user-start", p.start_point);
        osm::anchor(&mut draft, "user-end", p.end_point);
        let graph = Graph::new(draft);
        let finalize = t.elapsed().as_secs_f64() * 1000.0;
        let t = Instant::now();
        let result = candidates::generate(&graph, &p, Budget::new(Duration::from_secs(30)));
        let generation = t.elapsed().as_secs_f64() * 1000.0;
        let mut output = serde_json::json!({"prepareMs":prepare,"finalizeMs":finalize,"generateMs":generation,"cpuStagesMs":prepare+finalize+generation,"candidates":result.as_ref().map_or(0, Vec::len), "error":result.as_ref().err()});
        // Full results are serialized after the timed stages, only for equivalence checks.
        if input["includeResults"].as_bool().unwrap_or(false) {
            output["result"] = serde_json::to_value(result.as_ref().ok()).unwrap();
        }
        #[cfg(feature = "profiling")]
        routecraft_engine::profiling::COUNTERS.with(|c| {
            output["profile"] = serde_json::to_value(&*c.borrow()).unwrap();
        });
        println!("{output}");
    }
}

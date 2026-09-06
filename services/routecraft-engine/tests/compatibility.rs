use routecraft_engine::{model::*, osm::*};
use std::{io::Read, path::PathBuf};
fn reference(path: &std::path::Path) -> serde_json::Value {
    let mut data = String::new();
    flate2::read::GzDecoder::new(std::fs::File::open(path).unwrap())
        .read_to_string(&mut data)
        .unwrap();
    serde_json::from_str(&data).unwrap()
}
fn compare(actual: &serde_json::Value, expected: &serde_json::Value, at: &str) {
    match (actual, expected) {
        (serde_json::Value::Number(a), serde_json::Value::Number(b)) => {
            let a = a.as_f64().unwrap();
            let b = b.as_f64().unwrap();
            if at.contains(".candidates")
                && !at.contains(".geometry")
                && !at.contains(".waypoints")
                && (!at.contains(".metrics") || at.ends_with(".totalScore"))
            {
                assert_eq!(a, b, "published rounding: {at}");
            }
            assert!(
                (a - b).abs() <= 1e-6_f64.max(b.abs() * 1e-6),
                "{at}: {a} != {b}"
            );
        }
        (serde_json::Value::Array(a), serde_json::Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{at}");
            for (i, (a, b)) in a.iter().zip(b).enumerate() {
                compare(a, b, &format!("{at}[{i}]"));
            }
        }
        (serde_json::Value::Object(a), serde_json::Value::Object(b)) => {
            if at.contains(".candidates") {
                assert_eq!(
                    a.keys().collect::<Vec<_>>(),
                    b.keys().collect::<Vec<_>>(),
                    "candidate fields: {at}"
                );
            }
            for (k, v) in a {
                compare(
                    v,
                    b.get(k).unwrap_or(&serde_json::Value::Null),
                    &format!("{at}.{k}"),
                );
            }
        }
        _ => assert_eq!(actual, expected, "{at}"),
    }
}
#[test]
fn recorded_graphs_match_java() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../routing-compat/fixtures");
    let mut count = 0;
    for area in ["urban", "park", "hilly"] {
        let input: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join(format!("{area}.json"))).unwrap(),
        )
        .unwrap();
        let elements: Vec<OsmElement> = serde_json::from_value(input["elements"].clone()).unwrap();
        for activity in ["running", "hiking", "cycling"] {
            for route in ["loop", "out_and_back", "point_to_point"] {
                for v in 0..2 {
                    let name = format!("{area}-{activity}-{route}-{v}");
                    let expected = reference(&dir.join(format!("{name}.reference.json.gz")));
                    let prefs: Preferences =
                        serde_json::from_value(expected["preferences"].clone()).unwrap();
                    let raw = create_edges(&elements, &prefs, false);
                    compare(
                        &serde_json::to_value(&raw).unwrap(),
                        &expected["raw"],
                        &format!("{name}.raw"),
                    );
                    let indexed = create_edges(&elements, &prefs, true);
                    compare(
                        &serde_json::to_value(&indexed).unwrap(),
                        &serde_json::to_value(&raw).unwrap(),
                        &format!("{name}.indexed"),
                    );
                    let mut trimmed = trim(raw, &prefs);
                    compare(
                        &serde_json::to_value(&trimmed).unwrap(),
                        &expected["trimmed"],
                        &format!("{name}.trimmed"),
                    );
                    apply_elevations(
                        &mut trimmed,
                        &serde_json::from_value(expected["elevations"].clone()).unwrap(),
                    );
                    anchor(&mut trimmed, "user-start", prefs.start_point);
                    anchor(&mut trimmed, "user-end", prefs.end_point);
                    let graph = routecraft_engine::graph::Graph::new(trimmed.clone());
                    let candidates = routecraft_engine::candidates::generate(
                        &graph,
                        &prefs,
                        routecraft_engine::search::Budget::new(std::time::Duration::from_secs(30)),
                    )
                    .unwrap();
                    compare(
                        &serde_json::to_value(&candidates).unwrap(),
                        &expected["candidates"],
                        &format!("{name}.candidates"),
                    );
                    trimmed.edges = trimmed
                        .edges
                        .into_iter()
                        .flat_map(|e| {
                            let r = e.reverse();
                            [e, r]
                        })
                        .collect();
                    compare(
                        &serde_json::to_value(&trimmed).unwrap(),
                        &expected["finalGraph"],
                        &format!("{name}.final"),
                    );
                    count += 1;
                }
            }
        }
    }
    assert_eq!(count, 54);
}

use crate::model::*;
use std::f64::consts::PI;
pub fn round(x: f64, digits: i32) -> f64 {
    let f = 10_f64.powi(digits);
    (x * f + 0.5).floor() / f
}
pub fn radians(x: f64) -> f64 {
    x * PI / 180.0
}
pub fn degrees(x: f64) -> f64 {
    x * 180.0 / PI
}
pub fn distance(a: Point, b: Point) -> f64 {
    let dlat = radians(b.lat - a.lat);
    let dlng = radians(b.lng - a.lng);
    let h = (dlat / 2.0).sin() * (dlat / 2.0).sin()
        + radians(a.lat).cos() * radians(b.lat).cos() * (dlng / 2.0).sin() * (dlng / 2.0).sin();
    2.0 * 6371.0 * h.sqrt().asin() * 1000.0
}
pub fn geometry_distance(g: &[Point]) -> f64 {
    g.windows(2).map(|w| distance(w[0], w[1])).sum()
}
pub fn bearing(a: Point, b: Point) -> f64 {
    let a_lat = radians(a.lat);
    let b_lat = radians(b.lat);
    let dlng = radians(b.lng - a.lng);
    let y = dlng.sin() * b_lat.cos();
    let x = a_lat.cos() * b_lat.sin() - a_lat.sin() * b_lat.cos() * dlng.cos();
    (degrees(y.atan2(x)) + 360.0) % 360.0
}
pub fn destination(start: Point, bearing: f64, meters: f64) -> Point {
    let d = meters / 6371000.0;
    let b = radians(bearing);
    let lat = radians(start.lat);
    let lng = radians(start.lng);
    let dest_lat = (lat.sin() * d.cos() + lat.cos() * d.sin() * b.cos()).asin();
    let dest_lng =
        lng + (b.sin() * d.sin() * lat.cos()).atan2(d.cos() - lat.sin() * dest_lat.sin());
    Point {
        lat: round(degrees(dest_lat), 6),
        lng: round(degrees(dest_lng), 6),
    }
}
pub fn angular_difference(a: f64, b: f64) -> f64 {
    let d = (a - b).abs() % 360.0;
    if d > 180.0 { 360.0 - d } else { d }
}
pub fn normalize(v: f64) -> f64 {
    if v <= 1.0 {
        v.clamp(0.0, 1.0)
    } else {
        ((v - 1.0) / 2.0).clamp(0.0, 1.0)
    }
}
pub fn pace(a: Activity) -> f64 {
    match a {
        Activity::Running => 5.6,
        Activity::Hiking => 12.5,
        Activity::Cycling => 3.1,
    }
}
pub fn target(p: &Preferences) -> f64 {
    if let Some(d) = p.target_distance_km.filter(|x| *x > 0.0) {
        d
    } else if let Some(t) = p.target_duration_min.filter(|x| *x > 0.0) {
        round(t / pace(p.activity), 1)
    } else {
        5.0
    }
}
pub fn tolerance(d: f64) -> f64 {
    0.08_f64.max(0.35 / d.max(0.1).sqrt())
}
pub fn radius(p: &Preferences) -> f64 {
    (target(p)
        * if p.activity == Activity::Cycling {
            0.65
        } else {
            0.6
        }
        + 1.0)
        .clamp(
            2.5,
            if p.activity == Activity::Cycling {
                20.0
            } else {
                14.0
            },
        )
}
pub fn start(p: &Preferences) -> Point {
    p.start_point.unwrap_or(Point {
        lat: 40.0149,
        lng: -105.2705,
    })
}
pub fn edge_key(a: &str, b: &str) -> String {
    if a <= b {
        format!("{a}<>{b}")
    } else {
        format!("{b}<>{a}")
    }
}
pub fn node_key(p: Point) -> String {
    format!("{},{}", decimal6(p.lat), decimal6(p.lng))
}
pub fn midpoint(a: Point, b: Point) -> Point {
    Point {
        lat: (a.lat + b.lat) / 2.0,
        lng: (a.lng + b.lng) / 2.0,
    }
}
pub fn offset(origin: Point, p: Point) -> [f64; 2] {
    [
        (p.lng - origin.lng) * PI * 6371000.0 * radians(origin.lat).cos() / 180.0,
        (p.lat - origin.lat) * PI * 6371000.0 / 180.0,
    ]
}
pub fn projection(p: Point, a: Point, b: Point) -> (Point, f64) {
    let av = offset(p, a);
    let bv = offset(p, b);
    let sx = bv[0] - av[0];
    let sy = bv[1] - av[1];
    let len = sx * sx + sy * sy;
    if len == 0.0 {
        return (a, distance(p, a));
    }
    let t = (-(av[0] * sx + av[1] * sy) / len).clamp(0.0, 1.0);
    (
        Point {
            lat: a.lat + (b.lat - a.lat) * t,
            lng: a.lng + (b.lng - a.lng) * t,
        },
        (av[0] + sx * t).hypot(av[1] + sy * t),
    )
}
pub fn segment_distance_km(p: Point, a: Point, b: Point) -> f64 {
    let scale = 111.32 * radians(p.lat).cos();
    let ax = (a.lng - p.lng) * scale;
    let ay = (a.lat - p.lat) * 111.32;
    let bx = (b.lng - p.lng) * scale;
    let by = (b.lat - p.lat) * 111.32;
    let sx = bx - ax;
    let sy = by - ay;
    let len = sx * sx + sy * sy;
    if len == 0.0 {
        return distance(p, a) / 1000.0;
    }
    let t = (-(ax * sx + ay * sy) / len).clamp(0.0, 1.0);
    ((ax + sx * t) * (ax + sx * t) + (ay + sy * t) * (ay + sy * t)).sqrt()
}

// Java Formatter rounds the canonical decimal representation half-up, unlike
// Rust's binary tie-to-even formatting (OSM often contains exactly seven decimals).
pub fn decimal6(x: f64) -> String {
    let text = x.abs().to_string();
    let (mantissa, exponent) = text
        .split_once('e')
        .map(|(m, e)| (m, e.parse::<i32>().unwrap()))
        .unwrap_or((&text, 0));
    let decimal = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let mut digits: String = mantissa.chars().filter(|&c| c != '.').collect();
    let cut = decimal + exponent + 6;
    let value = if cut < 0 {
        0
    } else {
        while digits.len() <= cut as usize {
            digits.push('0');
        }
        let head = &digits[..cut as usize];
        let n = if head.is_empty() {
            0
        } else {
            head.parse::<u64>().unwrap()
        };
        n + u64::from(digits.as_bytes()[cut as usize] >= b'5')
    };
    format!(
        "{}{}.{:06}",
        if x.is_sign_negative() { "-" } else { "" },
        value / 1_000_000,
        value % 1_000_000
    )
}

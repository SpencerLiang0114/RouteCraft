use crate::{
    candidates,
    graph::Graph,
    model::*,
    osm,
    search::{Budget, EngineError},
};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path as UrlPath, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;

pub const PROTOCOL_VERSION: u32 = 1;
#[derive(Clone)]
pub struct Settings {
    pub computation_budget: Duration,
    pub ttl: Duration,
    pub retained_bytes: usize,
    pub concurrency: usize,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            computation_budget: Duration::from_secs(30),
            ttl: Duration::from_secs(120),
            retained_bytes: 512 * 1024 * 1024,
            concurrency: std::thread::available_parallelism()
                .map(usize::from)
                .unwrap_or(1),
        }
    }
}
#[derive(Clone)]
pub struct EngineState(Arc<Inner>);
struct Inner {
    settings: Settings,
    graphs: Mutex<HashMap<String, Entry>>,
    used: Arc<AtomicUsize>,
    slots: Arc<Semaphore>,
}
struct Reservation {
    bytes: usize,
    used: Arc<AtomicUsize>,
}
impl Drop for Reservation {
    fn drop(&mut self) {
        self.used.fetch_sub(self.bytes, Ordering::SeqCst);
    }
}
struct Entry {
    draft: Draft,
    preferences: Preferences,
    expires: Instant,
    remaining: Duration,
    _memory: Reservation,
}
struct CancelOnDrop(Budget);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
impl EngineState {
    pub fn new(settings: Settings) -> Self {
        let slots = Arc::new(Semaphore::new(settings.concurrency.max(1)));
        Self(Arc::new(Inner {
            settings,
            graphs: Mutex::new(HashMap::new()),
            used: Arc::new(AtomicUsize::new(0)),
            slots,
        }))
    }
    pub fn sweep(&self) {
        let now = Instant::now();
        self.0.graphs.lock().unwrap().retain(|_, e| e.expires > now);
    }
    pub fn retained_bytes(&self) -> usize {
        self.0.used.load(Ordering::SeqCst)
    }
    fn reserve(&self, bytes: usize) -> Result<Reservation, EngineError> {
        self.0
            .used
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |used| {
                used.checked_add(bytes)
                    .filter(|&n| n <= self.0.settings.retained_bytes)
            })
            .map_err(|_| EngineError::Overload)?;
        Ok(Reservation {
            bytes,
            used: self.0.used.clone(),
        })
    }
}
impl IntoResponse for EngineError {
    fn into_response(self) -> Response {
        let status = match self {
            Self::MalformedInput => StatusCode::BAD_REQUEST,
            Self::InsufficientGraphData | Self::NoRoute => StatusCode::UNPROCESSABLE_ENTITY,
            Self::ExpiredHandle => StatusCode::GONE,
            Self::Overload => StatusCode::SERVICE_UNAVAILABLE,
            Self::Timeout => StatusCode::GATEWAY_TIMEOUT,
        };
        (
            status,
            Json(serde_json::json!({"code":self,"protocolVersion":PROTOCOL_VERSION})),
        )
            .into_response()
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareRequest {
    pub elements: Vec<OsmElement>,
    pub preferences: Preferences,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedResponse {
    pub handle: String,
    pub node_points: Vec<Point>,
    pub protocol_version: u32,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GenerateRequest {
    elevations: HashMap<String, f64>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedResponse {
    candidates: Vec<Candidate>,
    protocol_version: u32,
}
fn valid_point(p: Point) -> bool {
    p.lat.is_finite()
        && p.lng.is_finite()
        && (-90.0..=90.0).contains(&p.lat)
        && (-180.0..=180.0).contains(&p.lng)
}
fn validate(request: &PrepareRequest) -> Result<(), EngineError> {
    let p = &request.preferences;
    if !p.start_point.is_some_and(valid_point)
        || p.end_point.is_some_and(|p| !valid_point(p))
        || p.target_distance_km
            .is_some_and(|v| !v.is_finite() || !(0.1..=200.0).contains(&v))
        || p.target_duration_min
            .is_some_and(|v| !v.is_finite() || !(1.0..=1440.0).contains(&v))
        || [
            p.park_preference,
            p.shade_preference,
            p.elevation_preference,
            p.safety_preference,
            p.exploration_preference,
        ]
        .iter()
        .any(|v| !v.is_finite() || !(0.0..=3.0).contains(v))
        || request.elements.iter().any(|e| {
            e.geometry
                .as_ref()
                .is_some_and(|g| g.iter().any(|&p| !valid_point(p)))
        })
    {
        return Err(EngineError::MalformedInput);
    }
    Ok(())
}
fn memory_bytes(draft: &Draft) -> usize {
    let nodes = draft.nodes.capacity() * std::mem::size_of::<Node>()
        + draft.nodes.iter().map(|n| n.id.capacity()).sum::<usize>();
    let edges = draft.edges.capacity() * std::mem::size_of::<Edge>()
        + draft
            .edges
            .iter()
            .map(|e| {
                e.id.capacity()
                    + e.from.capacity()
                    + e.to.capacity()
                    + e.surface_type.capacity()
                    + e.road_type.capacity()
                    + std::mem::size_of_val(e.geometry.as_ref())
                    + 64
            })
            .sum::<usize>();
    // Include allocator and map/entry overhead conservatively in the retained budget.
    (nodes + edges) * 2 + 4096
}
fn json_response(value: &impl Serialize) -> Result<Response, EngineError> {
    let bytes = serde_json::to_vec(value).map_err(|_| EngineError::MalformedInput)?;
    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        bytes,
    )
        .into_response())
}
pub fn router(state: EngineState) -> Router {
    Router::new()
        .route(
            "/health",
            get(|| async {
                Json(serde_json::json!({"status":"ok","protocolVersion":PROTOCOL_VERSION}))
            }),
        )
        .route("/internal/v1/graphs/prepare", post(prepare))
        .route("/internal/v1/graphs/{handle}/generate", post(generate))
        .route("/internal/v1/graphs/{handle}", delete(release))
        .layer(DefaultBodyLimit::max(64 * 1024 * 1024))
        .with_state(state)
}
async fn prepare(
    State(state): State<EngineState>,
    body: Result<Bytes, axum::extract::rejection::BytesRejection>,
) -> Result<Response, EngineError> {
    let body = body.map_err(|_| EngineError::MalformedInput)?;
    state.sweep();
    if state.retained_bytes() >= state.0.settings.retained_bytes {
        return Err(EngineError::Overload);
    }
    let slot = state
        .0
        .slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| EngineError::Overload)?;
    let budget = Budget::new(state.0.settings.computation_budget);
    let _cancel = CancelOnDrop(budget.clone());
    let timeout = state.0.settings.computation_budget;
    let worker = tokio::task::spawn_blocking(move || {
        let _slot = slot;
        let began = Instant::now();
        let bytes = body.len();
        let request: PrepareRequest =
            serde_json::from_slice(&body).map_err(|_| EngineError::MalformedInput)?;
        validate(&request)?;
        budget.check()?;
        let raw =
            osm::create_edges_with_budget(&request.elements, &request.preferences, true, &budget)?;
        let draft = osm::trim(raw, &request.preferences);
        budget.check()?;
        let memory = state.reserve(memory_bytes(&draft))?;
        let handle = uuid::Uuid::new_v4().to_string();
        let node_points = draft.nodes.iter().map(|n| n.point).collect();
        eprintln!(
            "routing_stage stage=graph_construction engine=rust elapsed_ms={} nodes={} edges={} payload_bytes={}",
            began.elapsed().as_secs_f64() * 1000.0,
            draft.nodes.len(),
            draft.edges.len(),
            bytes
        );
        let response = json_response(&PreparedResponse {
            handle: handle.clone(),
            node_points,
            protocol_version: PROTOCOL_VERSION,
        })?;
        let remaining = state
            .0
            .settings
            .computation_budget
            .saturating_sub(began.elapsed());
        budget.check()?;
        state.0.graphs.lock().unwrap().insert(
            handle.clone(),
            Entry {
                draft,
                preferences: request.preferences,
                expires: Instant::now() + state.0.settings.ttl,
                remaining,
                _memory: memory,
            },
        );
        Ok(response)
    });
    tokio::time::timeout(timeout, worker)
        .await
        .map_err(|_| EngineError::Timeout)?
        .map_err(|_| EngineError::MalformedInput)?
}
async fn generate(
    State(state): State<EngineState>,
    UrlPath(handle): UrlPath<String>,
    body: Result<Bytes, axum::extract::rejection::BytesRejection>,
) -> Result<Response, EngineError> {
    let body = body.map_err(|_| EngineError::MalformedInput)?;
    let slot = state
        .0
        .slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| EngineError::Overload)?;
    let entry = state
        .0
        .graphs
        .lock()
        .unwrap()
        .remove(&handle)
        .ok_or(EngineError::ExpiredHandle)?;
    if entry.expires <= Instant::now() {
        return Err(EngineError::ExpiredHandle);
    }
    let budget = Budget::new(entry.remaining);
    let _cancel = CancelOnDrop(budget.clone());
    let timeout = entry.remaining;
    let worker = tokio::task::spawn_blocking(move || {
        let _slot = slot;
        let began = Instant::now();
        let request: GenerateRequest =
            serde_json::from_slice(&body).map_err(|_| EngineError::MalformedInput)?;
        if request.elevations.values().any(|v| !v.is_finite()) {
            return Err(EngineError::MalformedInput);
        }
        budget.check()?;
        let Entry {
            mut draft,
            preferences,
            _memory,
            ..
        } = entry;
        osm::apply_elevations(&mut draft, &request.elevations);
        budget.check()?;
        osm::anchor(&mut draft, "user-start", preferences.start_point);
        budget.check()?;
        osm::anchor(&mut draft, "user-end", preferences.end_point);
        budget.check()?;
        if draft.nodes.len() < 8 || draft.edges.len() < 8 {
            return Err(EngineError::InsufficientGraphData);
        }
        let graph = Graph::new(draft);
        budget.check()?;
        eprintln!(
            "routing_stage stage=graph_finalize engine=rust elapsed_ms={} nodes={} edges={}",
            began.elapsed().as_secs_f64() * 1000.0,
            graph.nodes.len(),
            graph.edges.len()
        );
        let started = Instant::now();
        let candidates = candidates::generate(&graph, &preferences, budget.clone())?;
        budget.check()?;
        eprintln!(
            "routing_stage stage=candidate_generation_selection engine=rust elapsed_ms={} candidates={}",
            started.elapsed().as_secs_f64() * 1000.0,
            candidates.len()
        );
        if candidates.is_empty() {
            return Err(EngineError::NoRoute);
        }
        let response = json_response(&GeneratedResponse {
            candidates,
            protocol_version: PROTOCOL_VERSION,
        })?;
        budget.check()?;
        Ok(response)
    });
    tokio::time::timeout(timeout, worker)
        .await
        .map_err(|_| EngineError::Timeout)?
        .map_err(|_| EngineError::MalformedInput)?
}
async fn release(State(state): State<EngineState>, UrlPath(handle): UrlPath<String>) -> StatusCode {
    state.0.graphs.lock().unwrap().remove(&handle);
    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use tower::ServiceExt;
    fn fixture() -> serde_json::Value {
        let points: Vec<_> = (0..12)
            .map(|i| Point {
                lat: 40.0 + i as f64 * 0.0009,
                lng: -74.0,
            })
            .collect();
        serde_json::json!({"elements":[{"type":"way","id":9223372036854770000i64,"nodes":(0..12).map(|n|n+9007199254740992i64).collect::<Vec<_>>(),"geometry":points,"tags":{"highway":"residential"}}],"preferences":{"activity":"running","routeType":"out_and_back","targetDistanceKm":0.8,"startPoint":points[0],"parkPreference":0.0,"shadePreference":0.0,"elevationPreference":0.0,"safetyPreference":0.0,"explorationPreference":0.0}})
    }
    async fn call(
        app: Router,
        method: &str,
        path: &str,
        body: serde_json::Value,
    ) -> (StatusCode, serde_json::Value) {
        let response = app
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = to_bytes(response.into_body(), 64 * 1024 * 1024)
            .await
            .unwrap();
        (
            status,
            serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null),
        )
    }
    #[tokio::test]
    async fn handles_are_one_shot_and_cleanup_is_idempotent() {
        let state = EngineState::new(Settings::default());
        let app = router(state.clone());
        let (status, response) = call(
            app.clone(),
            "POST",
            "/internal/v1/graphs/prepare",
            fixture(),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(state.retained_bytes() > 0);
        let handle = response["handle"].as_str().unwrap();
        let path = format!("/internal/v1/graphs/{handle}");
        let (status, result) = call(
            app.clone(),
            "POST",
            &format!("{path}/generate"),
            serde_json::json!({"elevations":{}}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{result}");
        assert!(!result["candidates"].as_array().unwrap().is_empty());
        assert_eq!(state.retained_bytes(), 0);
        let (status, result) = call(
            app.clone(),
            "POST",
            &format!("{path}/generate"),
            serde_json::json!({"elevations":{}}),
        )
        .await;
        assert_eq!(status, StatusCode::GONE);
        assert_eq!(result["code"], "expired_handle");
        assert_eq!(
            call(app, "DELETE", &path, serde_json::Value::Null).await.0,
            StatusCode::NO_CONTENT
        );
    }
    #[tokio::test]
    async fn expiry_restart_budget_and_overload_are_typed() {
        let state = EngineState::new(Settings {
            ttl: Duration::ZERO,
            ..Settings::default()
        });
        let app = router(state.clone());
        let (_, r) = call(
            app.clone(),
            "POST",
            "/internal/v1/graphs/prepare",
            fixture(),
        )
        .await;
        let path = format!(
            "/internal/v1/graphs/{}/generate",
            r["handle"].as_str().unwrap()
        );
        state.sweep();
        assert_eq!(state.retained_bytes(), 0);
        assert_eq!(
            call(app, "POST", &path, serde_json::json!({"elevations":{}}))
                .await
                .1["code"],
            "expired_handle"
        );
        assert_eq!(
            call(
                router(EngineState::new(Settings::default())),
                "POST",
                &path,
                serde_json::json!({"elevations":{}})
            )
            .await
            .1["code"],
            "expired_handle"
        );
        let state = EngineState::new(Settings {
            retained_bytes: 1,
            ..Settings::default()
        });
        assert_eq!(
            call(
                router(state.clone()),
                "POST",
                "/internal/v1/graphs/prepare",
                fixture()
            )
            .await
            .1["code"],
            "overload"
        );
        assert_eq!(state.retained_bytes(), 0);
        let state = EngineState::new(Settings {
            concurrency: 1,
            ..Settings::default()
        });
        let _permit = state.0.slots.acquire().await.unwrap();
        assert_eq!(
            call(
                router(state.clone()),
                "POST",
                "/internal/v1/graphs/prepare",
                fixture()
            )
            .await
            .1["code"],
            "overload"
        );
        let state = EngineState::new(Settings {
            computation_budget: Duration::ZERO,
            ..Settings::default()
        });
        assert_eq!(
            call(
                router(state),
                "POST",
                "/internal/v1/graphs/prepare",
                fixture()
            )
            .await
            .1["code"],
            "timeout"
        );
    }
    #[tokio::test]
    async fn malformed_requests_and_no_route_do_not_leak_graphs() {
        let state = EngineState::new(Settings::default());
        let app = router(state.clone());
        assert_eq!(
            call(
                app.clone(),
                "POST",
                "/internal/v1/graphs/prepare",
                serde_json::json!({})
            )
            .await
            .1["code"],
            "malformed_input"
        );
        let budget = Budget::new(Duration::from_secs(1));
        drop(CancelOnDrop(budget.clone()));
        assert_eq!(budget.check(), Err(EngineError::Timeout));
        let mut sparse = fixture();
        sparse["elements"] = serde_json::json!([]);
        let (_, prepared) = call(app.clone(), "POST", "/internal/v1/graphs/prepare", sparse).await;
        let sparse_path = format!(
            "/internal/v1/graphs/{}/generate",
            prepared["handle"].as_str().unwrap()
        );
        assert_eq!(
            call(
                app.clone(),
                "POST",
                &sparse_path,
                serde_json::json!({"elevations":{}})
            )
            .await
            .1["code"],
            "insufficient_graph_data"
        );
        assert_eq!(state.retained_bytes(), 0);
        let mut request = fixture();
        request["preferences"]["startPoint"]["lat"] = serde_json::json!(100);
        assert_eq!(
            call(app.clone(), "POST", "/internal/v1/graphs/prepare", request)
                .await
                .1["code"],
            "malformed_input"
        );
        let (_, r) = call(
            app.clone(),
            "POST",
            "/internal/v1/graphs/prepare",
            fixture(),
        )
        .await;
        let path = format!(
            "/internal/v1/graphs/{}/generate",
            r["handle"].as_str().unwrap()
        );
        assert_eq!(
            call(
                app.clone(),
                "POST",
                &path,
                serde_json::json!({"elevations":[]})
            )
            .await
            .1["code"],
            "malformed_input"
        );
        assert_eq!(state.retained_bytes(), 0);
        let mut request = fixture();
        request["preferences"]["routeType"] = serde_json::json!("point_to_point");
        request["preferences"]["endPoint"] = request["preferences"]["startPoint"].clone();
        let (_, r) = call(app.clone(), "POST", "/internal/v1/graphs/prepare", request).await;
        let path = format!(
            "/internal/v1/graphs/{}/generate",
            r["handle"].as_str().unwrap()
        );
        assert_eq!(
            call(app, "POST", &path, serde_json::json!({"elevations":{}}))
                .await
                .1["code"],
            "no_route"
        );
        assert_eq!(state.retained_bytes(), 0);
    }
}

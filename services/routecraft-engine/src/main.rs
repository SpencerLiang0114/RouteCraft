use routecraft_engine::server::{self, EngineState, Settings};
use std::time::Duration;
#[tokio::main]
async fn main() {
    let budget = std::env::var("ROUTECRAFT_ENGINE_BUDGET_SECONDS")
        .ok()
        .map(|v| v.parse::<u64>().expect("budget must be seconds"))
        .unwrap_or(30);
    assert!(budget > 0, "budget must be positive");
    let state = EngineState::new(Settings {
        computation_budget: Duration::from_secs(budget),
        ..Settings::default()
    });
    let cleanup = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            cleanup.sweep();
        }
    });
    let address =
        std::env::var("ROUTECRAFT_ENGINE_LISTEN").unwrap_or_else(|_| "0.0.0.0:8090".into());
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("engine listen");
    axum::serve(listener, server::router(state))
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
        })
        .await
        .expect("engine server");
}

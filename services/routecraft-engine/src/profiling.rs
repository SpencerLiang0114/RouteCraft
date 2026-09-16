//! Per-thread diagnostic counters, compiled out of normal builds.
#[cfg(feature = "profiling")]
use std::cell::RefCell;

#[cfg(feature = "profiling")]
#[derive(Default, Clone, serde::Serialize)]
pub struct Counters {
    pub search_calls: usize,
    pub queue_pops: usize,
    pub relaxed_edges: usize,
    pub touched_nodes: usize,
    pub green_feature_distances: usize,
    pub path_reconstructions: usize,
}

#[cfg(feature = "profiling")]
thread_local! {
    pub static COUNTERS: RefCell<Counters> = RefCell::new(Counters::default());
}

#[macro_export]
macro_rules! count {
    ($field:ident) => {
        #[cfg(feature = "profiling")]
        $crate::profiling::COUNTERS.with(|c| c.borrow_mut().$field += 1);
    };
}

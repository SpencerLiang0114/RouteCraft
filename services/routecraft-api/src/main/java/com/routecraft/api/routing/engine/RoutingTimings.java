package com.routecraft.api.routing.engine;

import java.lang.management.ManagementFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.routecraft.api.routing.model.UserPreferences;

/** Only bounded metadata is logged; never coordinates, keys, or provider exception bodies. */
public final class RoutingTimings implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(RoutingTimings.class);
    private final String stage;
    private final String engine;
    private final String routeType;
    private final long started = System.nanoTime();
    private final long cpuStarted = cpuTime();
    private int nodes = -1, edges = -1;
    private long bytes = -1;
    private String cache = "not_applicable";

    private RoutingTimings(String stage, String engine, UserPreferences preferences) {
        this.stage = stage;
        this.engine = engine;
        this.routeType = preferences == null ? "unknown" : preferences.routeType().value();
    }
    public static RoutingTimings stage(String stage, String engine, UserPreferences preferences) {
        return new RoutingTimings(stage, engine, preferences);
    }
    public void graph(int nodes, int edges) { this.nodes = nodes; this.edges = edges; }
    public void bytes(long bytes) { this.bytes = bytes; }
    public void cache(String cache) { this.cache = cache; }
    private static long cpuTime() {
        var bean = ManagementFactory.getThreadMXBean();
        return bean.isCurrentThreadCpuTimeSupported() ? bean.getCurrentThreadCpuTime() : -1;
    }
    @Override public void close() {
        long cpu = cpuTime();
        log.info("routing_stage stage={} engine={} route_type={} elapsed_ms={} thread_cpu_ms={} nodes={} edges={} payload_bytes={} cache={}",
                stage, engine, routeType, (System.nanoTime() - started) / 1e6,
                cpuStarted < 0 || cpu < 0 ? -1 : (cpu - cpuStarted) / 1e6, nodes, edges, bytes, cache);
    }
}

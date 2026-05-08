package com.routecraft.api.routing.osm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import com.routecraft.api.routing.model.LatLng;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

class ElevationServiceTests {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void fetchElevationsReturnsCompletedChunksWhenBudgetExpires() throws Exception {
        AtomicInteger requestCount = new AtomicInteger();
        startServer(exchange -> {
            if (requestCount.incrementAndGet() == 1) {
                writeJson(exchange, elevationResponse(100));
            } else {
                sleep(500);
                writeJson(exchange, elevationResponse(1));
            }
        });
        ElevationService service = service(Duration.ofMillis(150));
        List<LatLng> points = points(101);

        long started = System.nanoTime();
        Map<String, Double> elevations = service.fetchElevations(points);
        long elapsedMs = Duration.ofNanos(System.nanoTime() - started).toMillis();

        assertEquals(100, elevations.size());
        assertTrue(elapsedMs < 1000, "elevation lookup should stop waiting after the configured budget");
    }

    @Test
    void fetchElevationsSkipsAllNodesWhenProviderDoesNotReturnInBudget() throws Exception {
        startServer(exchange -> {
            sleep(500);
            writeJson(exchange, elevationResponse(1));
        });
        ElevationService service = service(Duration.ofMillis(100));

        long started = System.nanoTime();
        Map<String, Double> elevations = service.fetchElevations(List.of(new LatLng(37.0, -122.0)));
        long elapsedMs = Duration.ofNanos(System.nanoTime() - started).toMillis();

        assertTrue(elevations.isEmpty());
        assertTrue(elapsedMs < 1000, "elevation lookup should not block route generation");
    }

    private ElevationService service(Duration timeout) {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        return new ElevationService(new ObjectMapper(), HttpClient.newHttpClient(), baseUrl + "/meteo",
                baseUrl + "/open-elevation", timeout);
    }

    private void startServer(Handler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try {
                handler.handle(exchange);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                exchange.close();
            }
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
    }

    private static List<LatLng> points(int count) {
        List<LatLng> points = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            points.add(new LatLng(37.0 + i * 0.0001, -122.0));
        }
        return points;
    }

    private static String elevationResponse(int count) {
        StringBuilder json = new StringBuilder("{\"elevation\":[");
        for (int i = 0; i < count; i++) {
            if (i > 0) {
                json.append(',');
            }
            json.append(10 + i);
        }
        return json.append("]}").toString();
    }

    private static void writeJson(HttpExchange exchange, String json) throws IOException {
        byte[] bytes = json.getBytes();
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void sleep(long millis) throws InterruptedException {
        Thread.sleep(millis);
    }

    private interface Handler {
        void handle(HttpExchange exchange) throws IOException, InterruptedException;
    }
}

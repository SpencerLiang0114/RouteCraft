package com.routecraft.api.routing;

import java.util.List;

import java.util.Map;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.routecraft.api.routes.GeneratedRouteBatchRepository;
import com.routecraft.api.routing.engine.RoutingTimings;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.UserPreferences;

@RestController
@RequestMapping("/api/routing")
public class RoutingController {

    private final RouteGenerationService generationService;
    private final GeneratedRouteBatchRepository batchRepository;

    public RoutingController(RouteGenerationService generationService,
                              GeneratedRouteBatchRepository batchRepository) {
        this.generationService = generationService;
        this.batchRepository = batchRepository;
    }

    @PostMapping("/generate")
    public RoutesResponse generate(@Valid @RequestBody UserPreferences preferences) {
        LatLng startPoint = preferences.startPoint();
        if (startPoint == null || !startPoint.isValid()) {
            throw new IllegalArgumentException("Invalid or missing start coordinates.");
        }
        LatLng endPoint = preferences.endPoint();
        if (endPoint != null && !endPoint.isValid()) {
            throw new IllegalArgumentException("Invalid end coordinates.");
        }

        List<RouteCandidate> routes = generationService.generate(preferences);
        if (!routes.isEmpty()) {
            try (var stage = RoutingTimings.stage("persistence", "spring", preferences)) {
                batchRepository.saveTypedBatch(preferences, routes);
            }
        }
        return new RoutesResponse(routes);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
    }

    public record RoutesResponse(List<RouteCandidate> routes) {
    }
}

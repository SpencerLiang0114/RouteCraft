package com.routecraft.api.routing;

import java.util.List;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.routecraft.api.routes.GeneratedRouteBatchRepository;
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
        validate(preferences);
        List<RouteCandidate> routes = generationService.generate(preferences);
        if (!routes.isEmpty()) {
            batchRepository.saveTypedBatch(preferences, routes);
        }
        return new RoutesResponse(routes);
    }

    private static void validate(UserPreferences preferences) {
        if (preferences.activity() == null || preferences.routeType() == null) {
            throw new IllegalArgumentException("activity and routeType are required.");
        }
        LatLng startPoint = preferences.startPoint();
        if (startPoint == null || !startPoint.isValid()) {
            throw new IllegalArgumentException("Invalid or missing start coordinates.");
        }
        LatLng endPoint = preferences.endPoint();
        if (endPoint != null && !endPoint.isValid()) {
            throw new IllegalArgumentException("Invalid end coordinates.");
        }
    }

    public record RoutesResponse(List<RouteCandidate> routes) {
    }
}

package com.routecraft.api.routes;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/saved-routes")
class SavedRoutesController {

    private final SavedRouteRepository savedRouteRepository;

    SavedRoutesController(SavedRouteRepository savedRouteRepository) {
        this.savedRouteRepository = savedRouteRepository;
    }

    @GetMapping
    List<JsonNode> listSavedRoutes() {
        return savedRouteRepository.findAll();
    }

    @GetMapping("/{id}")
    ResponseEntity<JsonNode> getSavedRoute(@PathVariable String id) {
        return savedRouteRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/export.gpx")
    ResponseEntity<String> exportGpx(@PathVariable String id) {
        return savedRouteRepository.findById(id)
                .map(payload -> {
                    String gpx = GpxExporter.toGpx(payload);
                    return ResponseEntity.ok()
                            .header("Content-Type", "application/gpx+xml")
                            .header("Content-Disposition", "attachment; filename=\"" + id + ".gpx\"")
                            .body(gpx);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    JsonNode saveRoute(@RequestBody JsonNode route) {
        return savedRouteRepository.upsert(route);
    }
}

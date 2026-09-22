package com.routecraft.api.routes;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import com.routecraft.api.auth.AuthService;

@RestController
@RequestMapping("/api/saved-routes")
class SavedRoutesController {

    private final SavedRouteRepository savedRouteRepository;
    private final RouteShareRepository routeShareRepository;

    SavedRoutesController(
            SavedRouteRepository savedRouteRepository,
            RouteShareRepository routeShareRepository) {
        this.savedRouteRepository = savedRouteRepository;
        this.routeShareRepository = routeShareRepository;
    }

    @GetMapping
    List<JsonNode> listSavedRoutes() {
        return savedRouteRepository.findAllForUser(AuthService.requireCurrentUserId());
    }

    @GetMapping("/{id}")
    ResponseEntity<JsonNode> getSavedRoute(@PathVariable String id) {
        return savedRouteRepository.findByIdForUser(id, AuthService.requireCurrentUserId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/export.gpx")
    ResponseEntity<String> exportGpx(@PathVariable String id) {
        return savedRouteRepository.findByIdForUser(id, AuthService.requireCurrentUserId())
                .map(payload -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_TYPE, "application/gpx+xml")
                        .header(HttpHeaders.CONTENT_DISPOSITION, gpxContentDisposition(id))
                        .body(GpxExporter.toGpx(payload)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    JsonNode saveRoute(@RequestBody JsonNode route) {
        return savedRouteRepository.upsert(AuthService.requireCurrentUserId(), route);
    }

    @PatchMapping("/{id}")
    ResponseEntity<JsonNode> patchRoute(@PathVariable String id, @RequestBody PatchRequest patch) {
        return savedRouteRepository
                .rename(AuthService.requireCurrentUserId(), id, patch.name(), patch.notes())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> deleteRoute(@PathVariable String id) {
        boolean deleted = savedRouteRepository.delete(AuthService.requireCurrentUserId(), id);
        return deleted ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/{id}/shares")
    ResponseEntity<Map<String, Object>> createShare(
            @PathVariable String id,
            @RequestBody(required = false) CreateShareRequest request) {
        UUID userId = AuthService.requireCurrentUserId();
        if (savedRouteRepository.findByIdForUser(id, userId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Integer hours = request == null ? null : request.expiresInHours();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(routeShareRepository.create(userId, id, hours));
    }

    @DeleteMapping("/{id}/shares/{token}")
    ResponseEntity<Void> revokeShare(@PathVariable String id, @PathVariable String token) {
        UUID userId = AuthService.requireCurrentUserId();
        if (savedRouteRepository.findByIdForUser(id, userId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        boolean revoked = routeShareRepository.revoke(userId, token);
        return revoked ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    static String gpxContentDisposition(String id) {
        String filename = id.replaceAll("[^A-Za-z0-9._-]", "_");
        if (filename.isBlank()) {
            filename = "route";
        }
        return ContentDisposition.attachment().filename(filename + ".gpx").build().toString();
    }

    record PatchRequest(String name, String notes) {}

    record CreateShareRequest(Integer expiresInHours) {}
}

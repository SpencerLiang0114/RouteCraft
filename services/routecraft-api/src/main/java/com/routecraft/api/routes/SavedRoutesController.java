package com.routecraft.api.routes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import com.routecraft.api.auth.AuthService;
import com.routecraft.api.routes.SavedRouteRepository.SavedRouteQuery;

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
    List<JsonNode> listSavedRoutes(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String activity,
            @RequestParam(required = false) String folder,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) BigDecimal minDistanceKm,
            @RequestParam(required = false) BigDecimal maxDistanceKm,
            @RequestParam(required = false) BigDecimal minElevationM,
            @RequestParam(required = false) BigDecimal maxElevationM,
            @RequestParam(required = false) Instant savedAfter,
            @RequestParam(required = false) Instant savedBefore,
            @RequestParam(required = false, defaultValue = "newest") String sort) {
        UUID userId = AuthService.requireCurrentUserId();
        return savedRouteRepository.search(
                userId,
                new SavedRouteQuery(
                        q, activity, folder, tag,
                        minDistanceKm, maxDistanceKm,
                        minElevationM, maxElevationM,
                        savedAfter, savedBefore, sort));
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
                .map(payload -> {
                    String gpx = GpxExporter.toGpx(payload);
                    return ResponseEntity.ok()
                            .header(HttpHeaders.CONTENT_TYPE, "application/gpx+xml")
                            .header(HttpHeaders.CONTENT_DISPOSITION, gpxContentDisposition(id))
                            .body(gpx);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    JsonNode saveRoute(@RequestBody JsonNode route) {
        return savedRouteRepository.upsert(AuthService.requireCurrentUserId(), route);
    }

    @PatchMapping("/{id}")
    ResponseEntity<JsonNode> patchRoute(@PathVariable String id, @RequestBody JsonNode patch) {
        return savedRouteRepository.patch(AuthService.requireCurrentUserId(), id, patch)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> deleteRoute(@PathVariable String id) {
        boolean deleted = savedRouteRepository.delete(AuthService.requireCurrentUserId(), id);
        return deleted ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/{id}/duplicate")
    JsonNode duplicateRoute(@PathVariable String id) {
        return savedRouteRepository.duplicate(AuthService.requireCurrentUserId(), id);
    }

    @PostMapping("/{id}/shares")
    ResponseEntity<Map<String, Object>> createShare(
            @PathVariable String id,
            @RequestBody(required = false) CreateShareRequest request) {
        UUID userId = AuthService.requireCurrentUserId();
        if (savedRouteRepository.findByIdForUser(id, userId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Integer expiresInHours = request == null ? null : request.expiresInHours();
        RouteShareRepository.ShareRecord share = routeShareRepository.create(userId, id, expiresInHours);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", share.token());
        body.put("urlPath", "/share/" + share.token());
        body.put("expiresAt", share.expiresAt() == null ? null : share.expiresAt().toString());
        body.put("routeId", share.routeId());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    static String gpxContentDisposition(String id) {
        String filename = id.replaceAll("[^A-Za-z0-9._-]", "_");
        if (filename.isBlank()) {
            filename = "route";
        }
        return ContentDisposition.attachment().filename(filename + ".gpx").build().toString();
    }

    record CreateShareRequest(Integer expiresInHours) {}
}

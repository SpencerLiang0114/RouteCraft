package com.routecraft.api.osm;

import java.time.Instant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/osm-graph-cache")
class OsmGraphCacheController {

    private final OsmGraphCacheRepository osmGraphCacheRepository;

    OsmGraphCacheController(OsmGraphCacheRepository osmGraphCacheRepository) {
        this.osmGraphCacheRepository = osmGraphCacheRepository;
    }

    @GetMapping
    ResponseEntity<OsmGraphCacheResponse> getCacheEntry(@RequestParam String bbox) {
        return osmGraphCacheRepository.findFresh(bbox)
                .map(entry -> ResponseEntity.ok(new OsmGraphCacheResponse(entry.bbox(), entry.elements(), entry.expiresAt())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping
    OsmGraphCacheResponse putCacheEntry(@Valid @RequestBody OsmGraphCachePutRequest request) {
        OsmGraphCacheRepository.OsmGraphCacheEntry entry = osmGraphCacheRepository.put(
                request.bbox(),
                request.elements(),
                request.ttlSeconds() == null ? 600 : request.ttlSeconds());
        return new OsmGraphCacheResponse(entry.bbox(), entry.elements(), entry.expiresAt());
    }

    record OsmGraphCachePutRequest(
            @NotBlank String bbox,
            @NotNull JsonNode elements,
            @Min(60) @Max(86400) Integer ttlSeconds) {
    }

    record OsmGraphCacheResponse(String bbox, JsonNode elements, Instant expiresAt) {
    }
}

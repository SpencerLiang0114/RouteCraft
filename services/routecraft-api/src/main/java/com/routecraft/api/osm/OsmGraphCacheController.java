package com.routecraft.api.osm;

import java.time.Instant;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
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

    record OsmGraphCacheResponse(String bbox, JsonNode elements, Instant expiresAt) {
    }
}

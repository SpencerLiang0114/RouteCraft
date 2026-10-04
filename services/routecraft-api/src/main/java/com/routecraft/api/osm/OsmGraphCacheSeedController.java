package com.routecraft.api.osm;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import com.routecraft.api.osm.OsmGraphCacheController.OsmGraphCacheResponse;

/**
 * Test-only cache seeding. Route generation trusts cached elements, so an open write would let
 * anyone replace the street graph for an area; only the offline smoke test enables this.
 */
@RestController
@RequestMapping("/api/osm-graph-cache")
@ConditionalOnProperty(name = "routecraft.osm-cache.write-enabled", havingValue = "true")
class OsmGraphCacheSeedController {

    private final OsmGraphCacheRepository osmGraphCacheRepository;

    OsmGraphCacheSeedController(OsmGraphCacheRepository osmGraphCacheRepository) {
        this.osmGraphCacheRepository = osmGraphCacheRepository;
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
}

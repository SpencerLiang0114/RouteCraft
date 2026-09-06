package com.routecraft.api.routing.osm;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;

import com.routecraft.api.osm.OsmGraphCacheRepository;
import com.routecraft.api.routing.engine.RoutingTimings;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.UserPreferences;

@Component
public class OsmGraphLoader {

    private static final Logger log = LoggerFactory.getLogger(OsmGraphLoader.class);

    private static final int OSM_ELEMENTS_CACHE_TTL_SECONDS = 10 * 60;
    private static final int OSM_ELEMENTS_IN_MEMORY_MAX_ENTRIES = 30;
    private static final long OSM_ELEMENTS_IN_MEMORY_TTL_MS = 10L * 60L * 1000L;

    private final OverpassClient overpassClient;
    private final OsmGraphCacheRepository cacheRepository;
    private final ObjectMapper objectMapper;
    private final InMemoryCache inMemoryCache = new InMemoryCache();

    public OsmGraphLoader(OverpassClient overpassClient,
                          OsmGraphCacheRepository cacheRepository,
                          ObjectMapper objectMapper) {
        this.overpassClient = overpassClient;
        this.cacheRepository = cacheRepository;
        this.objectMapper = objectMapper;
    }

    public List<OsmElement> acquire(LatLng startPoint, UserPreferences preferences) {
        BBox bbox = BBox.around(startPoint, OsmGraphBuilder.graphRadiusKm(preferences));
        String bboxKey = bbox.key();

        List<OsmElement> elements;
        try (var stage = RoutingTimings.stage("cache_access", "spring", preferences)) {
            elements = inMemoryCache.get(bboxKey);
            stage.cache(elements == null ? "miss" : "memory_hit");
            if (elements == null) {
                Optional<JsonNode> persisted = loadPersisted(bboxKey);
                if (persisted.isPresent()) {
                    stage.cache("postgres_hit");
                    elements = overpassClient.parseElementsNode(persisted.get());
                    inMemoryCache.put(bboxKey, elements);
                }
            }
        }
        if (elements == null) {
            try (var stage = RoutingTimings.stage("overpass", "spring", preferences)) {
                elements = overpassClient.fetch(bbox);
            }
            inMemoryCache.put(bboxKey, elements);
            persistElements(bboxKey, elements);
        }

        return elements;
    }

    private Optional<JsonNode> loadPersisted(String bboxKey) {
        try {
            return cacheRepository.findFresh(bboxKey).map(OsmGraphCacheRepository.OsmGraphCacheEntry::elements);
        } catch (Exception ex) {
            log.debug("Could not read persisted OSM cache: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private void persistElements(String bboxKey, List<OsmElement> elements) {
        try {
            ArrayNode array = objectMapper.createArrayNode();
            for (OsmElement el : elements) {
                array.add(objectMapper.valueToTree(el));
            }
            cacheRepository.put(bboxKey, array, OSM_ELEMENTS_CACHE_TTL_SECONDS);
        } catch (Exception ex) {
            log.debug("Could not persist OSM cache: {}", ex.getMessage());
        }
    }

    private static final class InMemoryCache {
        private final LinkedHashMap<String, Entry> entries = new LinkedHashMap<>();

        synchronized List<OsmElement> get(String key) {
            Entry entry = entries.get(key);
            if (entry == null) return null;
            if (entry.expiresAt <= System.currentTimeMillis()) {
                entries.remove(key);
                return null;
            }
            return entry.elements;
        }

        synchronized void put(String key, List<OsmElement> elements) {
            long now = System.currentTimeMillis();
            entries.entrySet().removeIf(e -> e.getValue().expiresAt <= now);
            while (entries.size() >= OSM_ELEMENTS_IN_MEMORY_MAX_ENTRIES) {
                String oldestKey = entries.keySet().iterator().next();
                if (oldestKey == null) break;
                entries.remove(oldestKey);
            }
            entries.put(key, new Entry(elements, now + OSM_ELEMENTS_IN_MEMORY_TTL_MS));
        }

        private record Entry(List<OsmElement> elements, long expiresAt) {
        }
    }
}

package com.routecraft.api.routes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class SavedRouteRepositoryTests {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final SavedRouteRepository repository =
            new SavedRouteRepository(jdbcTemplate, new RoutePayloadReader(objectMapper));

    @Test
    void createAssignsServerIdInsteadOfClientRouteId() {
        UUID userId = UUID.randomUUID();

        JsonNode saved = repository.create(userId, route("generated-loop-1"));

        String id = saved.get("id").asString();
        assertTrue(id.startsWith("saved-"), id);
        UUID.fromString(id.substring("saved-".length()));
        Object[] args = insertArgs().get(0);
        assertEquals(id, args[0]);
        assertEquals(userId, args[1]);
        assertEquals(id, objectMapper.readTree((String) args[10]).get("id").asString());
    }

    @Test
    void savingTheSameClientRouteTwiceCreatesDistinctRows() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        String a = repository.create(first, route("generated-loop-1")).get("id").asString();
        String b = repository.create(second, route("generated-loop-1")).get("id").asString();
        String c = repository.create(first, route("generated-loop-1")).get("id").asString();

        assertNotEquals(a, b);
        assertNotEquals(a, c);
        List<Object[]> inserts = insertArgs();
        assertEquals(3, inserts.size());
        inserts.forEach(args -> assertTrue(((String) args[0]).startsWith("saved-")));
    }

    @Test
    void createRejectsNonObjectPayload() {
        assertThrows(IllegalArgumentException.class,
                () -> repository.create(UUID.randomUUID(), objectMapper.createArrayNode()));
        verifyNoInteractions(jdbcTemplate);
    }

    private List<Object[]> insertArgs() {
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, atLeastOnce()).update(anyString(), args.capture());
        return args.getAllValues();
    }

    private ObjectNode route(String id) {
        ObjectNode route = objectMapper.createObjectNode();
        route.put("id", id);
        route.put("source", "generated");
        route.put("name", "Morning loop");
        route.put("activity", "running");
        route.put("routeType", "loop");
        route.put("distanceKm", 6.4);
        route.put("estimatedDurationMin", 42);
        route.put("elevationGainM", 85);

        ArrayNode geometry = route.putArray("geometry");
        geometry.addObject().put("lat", 37.78).put("lng", -122.41);
        geometry.addObject().put("lat", 37.79).put("lng", -122.42);
        return route;
    }
}

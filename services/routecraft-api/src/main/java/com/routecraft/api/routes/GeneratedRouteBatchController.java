package com.routecraft.api.routes;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/generated-route-batches")
class GeneratedRouteBatchController {

    private final GeneratedRouteBatchRepository generatedRouteBatchRepository;

    GeneratedRouteBatchController(GeneratedRouteBatchRepository generatedRouteBatchRepository) {
        this.generatedRouteBatchRepository = generatedRouteBatchRepository;
    }

    @PostMapping
    GeneratedRouteBatchResponse saveGeneratedRoutes(@Valid @RequestBody GeneratedRouteBatchRequest request) {
        UUID batchId = generatedRouteBatchRepository.saveBatch(request.preferences(), request.routes());
        return new GeneratedRouteBatchResponse(batchId, request.routes().size());
    }

    record GeneratedRouteBatchRequest(
            @NotNull JsonNode preferences,
            @NotEmpty List<@NotNull JsonNode> routes) {
    }

    record GeneratedRouteBatchResponse(UUID batchId, int routeCount) {
    }
}

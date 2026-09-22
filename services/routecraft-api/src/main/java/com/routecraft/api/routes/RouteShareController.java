package com.routecraft.api.routes;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/shares")
class RouteShareController {

    private final RouteShareRepository routeShareRepository;

    RouteShareController(RouteShareRepository routeShareRepository) {
        this.routeShareRepository = routeShareRepository;
    }

    @GetMapping("/{token}")
    ResponseEntity<Map<String, Object>> getShare(@PathVariable String token) {
        return routeShareRepository.findPublicByToken(token)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}

package com.routecraft.api.routes;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

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
                .map(share -> {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("token", share.token());
                    body.put("routeId", share.routeId());
                    body.put("name", share.name());
                    body.put("expiresAt", share.expiresAt() == null ? null : share.expiresAt().toString());
                    body.put("route", share.route());
                    return ResponseEntity.ok(body);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}

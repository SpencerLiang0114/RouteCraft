package com.routecraft.api.routing.osm;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.routecraft.api.routing.model.LatLng;

@RestController
@RequestMapping("/api/geocode")
public class GeocodeController {

    private final GeocodeService geocodeService;

    public GeocodeController(GeocodeService geocodeService) {
        this.geocodeService = geocodeService;
    }

    public record GeocodeResponse(List<GeocodeResult> results, String message) {}
    
    public record GeocodeResult(String label, LatLng point, String category) {}

    @GetMapping("/search")
    public ResponseEntity<GeocodeResponse> search(@RequestParam(name = "q", required = false) String query) {
        try {
            List<GeocodeResult> results = geocodeService.searchAddress(query);
            return ResponseEntity.ok(new GeocodeResponse(results, null));
        } catch (Exception e) {
            return ResponseEntity.status(502).body(new GeocodeResponse(List.of(), "Address search failed: " + e.getMessage()));
        }
    }
}

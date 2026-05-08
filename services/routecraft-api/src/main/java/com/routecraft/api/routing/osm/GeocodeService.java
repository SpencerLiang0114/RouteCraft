package com.routecraft.api.routing.osm;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.osm.GeocodeController.GeocodeResult;

@Service
public class GeocodeService {

    private final RestClient restClient;

    public GeocodeService() {
        this.restClient = RestClient.builder()
                .baseUrl("https://nominatim.openstreetmap.org")
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "en")
                .defaultHeader(HttpHeaders.USER_AGENT, "RouteCraft local address search")
                .build();
    }

    private record NominatimResult(
            String display_name, 
            String lat, 
            String lon, 
            @JsonProperty("class") String clazz, 
            String type
    ) {}

    public List<GeocodeResult> searchAddress(String query) {
        if (query == null || query.trim().length() < 2 || query.trim().length() > 200) {
            return List.of();
        }

        List<NominatimResult> data = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/search")
                        .queryParam("q", query.trim())
                        .queryParam("format", "jsonv2")
                        .queryParam("addressdetails", "1")
                        .queryParam("limit", "6")
                        .build())
                .retrieve()
                .body(new ParameterizedTypeReference<List<NominatimResult>>() {});

        if (data == null) {
            return List.of();
        }

        return data.stream()
                .map(item -> {
                    try {
                        double lat = Double.parseDouble(item.lat());
                        double lng = Double.parseDouble(item.lon());
                        
                        String category = "";
                        if (item.clazz() != null && !item.clazz().isEmpty()) {
                            category += item.clazz();
                        }
                        if (item.type() != null && !item.type().isEmpty()) {
                            category += (category.isEmpty() ? "" : " / ") + item.type();
                        }
                        
                        return new GeocodeResult(item.display_name(), new LatLng(lat, lng), category);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }
}

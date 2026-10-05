package com.routecraft.api.osm;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import com.routecraft.api.auth.AppUserDetailsService;
import com.routecraft.api.auth.SecurityConfig;

class OsmGraphCacheSeedTests {

    private static final String BODY = "{\"bbox\":\"1,2,3,4\",\"elements\":[],\"ttlSeconds\":600}";

    @Nested
    @WebMvcTest(
            controllers = { OsmGraphCacheController.class, OsmGraphCacheSeedController.class },
            properties = "routecraft.cors.allowed-origins=http://localhost:3000")
    @Import(SecurityConfig.class)
    class Disabled {

        @Autowired
        private MockMvc mvc;

        @MockitoBean
        private OsmGraphCacheRepository repository;

        @MockitoBean
        private AppUserDetailsService userDetailsService;

        @Test
        void anonymousPutCannotOverwriteCache() throws Exception {
            mvc.perform(put("/api/osm-graph-cache").contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isMethodNotAllowed());
            verifyNoInteractions(repository);
        }
    }

    @Nested
    @WebMvcTest(
            controllers = { OsmGraphCacheController.class, OsmGraphCacheSeedController.class },
            properties = {
                    "routecraft.cors.allowed-origins=http://localhost:3000",
                    "routecraft.osm-cache.write-enabled=true" })
    @Import(SecurityConfig.class)
    class Enabled {

        @Autowired
        private MockMvc mvc;

        @MockitoBean
        private OsmGraphCacheRepository repository;

        @MockitoBean
        private AppUserDetailsService userDetailsService;

        @Test
        void smokeTestCanSeedCache() throws Exception {
            when(repository.put(anyString(), any(), anyInt())).thenReturn(new OsmGraphCacheRepository.OsmGraphCacheEntry(
                    "1,2,3,4", new ObjectMapper().createArrayNode(), Instant.now().plusSeconds(600)));

            mvc.perform(put("/api/osm-graph-cache").contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isOk());
        }
    }
}

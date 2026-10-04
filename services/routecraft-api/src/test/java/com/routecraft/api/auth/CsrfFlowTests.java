package com.routecraft.api.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

/**
 * Exercises the browser CSRF flow the frontend uses: fetch the token from
 * GET /api/auth/csrf, then echo it in X-XSRF-TOKEN alongside the XSRF-TOKEN cookie.
 */
@WebMvcTest(controllers = AuthController.class, properties = "routecraft.cors.allowed-origins=http://localhost:3000")
@Import(SecurityConfig.class)
class CsrfFlowTests {

    private static final String REGISTER_BODY =
            "{\"email\":\"ada@example.com\",\"password\":\"long-enough-pw\",\"displayName\":\"Ada\"}";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private StravaOAuthService stravaOAuthService;

    @MockitoBean
    private AppUserDetailsService userDetailsService;

    @Test
    void registerAcceptsTokenFromCsrfEndpoint() throws Exception {
        when(authService.register(any(), any(), any())).thenReturn(
                new AuthService.UserResponse(UUID.randomUUID(), "ada@example.com", "Ada"));

        MvcResult csrf = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String token = JsonPath.read(csrf.getResponse().getContentAsString(), "$.token");
        Cookie cookie = csrf.getResponse().getCookie("XSRF-TOKEN");

        mvc.perform(post("/api/auth/register")
                        .cookie(cookie)
                        .header("X-XSRF-TOKEN", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(REGISTER_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ada@example.com"));
    }

    @Test
    void registerRejectsMissingCsrfHeader() throws Exception {
        MvcResult csrf = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        Cookie cookie = csrf.getResponse().getCookie("XSRF-TOKEN");

        mvc.perform(post("/api/auth/register")
                        .cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(REGISTER_BODY))
                .andExpect(status().isForbidden());
    }

    @Test
    void registerRejectsForgedCsrfHeader() throws Exception {
        MvcResult csrf = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        Cookie cookie = csrf.getResponse().getCookie("XSRF-TOKEN");

        mvc.perform(post("/api/auth/register")
                        .cookie(cookie)
                        .header("X-XSRF-TOKEN", "forged")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(REGISTER_BODY))
                .andExpect(status().isForbidden());
    }
}

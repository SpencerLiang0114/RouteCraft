package com.routecraft.api.auth;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.routecraft.api.auth.AuthService.LoginRequest;
import com.routecraft.api.auth.AuthService.RegisterRequest;
import com.routecraft.api.auth.AuthService.UserResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/api/auth")
class AuthController {

    private final AuthService authService;
    private final StravaOAuthService stravaOAuthService;

    AuthController(AuthService authService, StravaOAuthService stravaOAuthService) {
        this.authService = authService;
        this.stravaOAuthService = stravaOAuthService;
    }

    @GetMapping("/csrf")
    Map<String, String> csrf(CsrfToken token) {
        return Map.of(
                "headerName", token.getHeaderName(),
                "parameterName", token.getParameterName(),
                "token", token.getToken());
    }

    @PostMapping("/register")
    UserResponse register(
            @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        return authService.register(request, httpRequest, httpResponse);
    }

    @PostMapping("/login")
    UserResponse login(
            @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        return authService.login(request, httpRequest, httpResponse);
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        authService.logout(request, response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    UserResponse me() {
        return authService.currentUser();
    }

    @GetMapping("/strava/connect")
    Map<String, String> stravaConnect() {
        return Map.of("authorizeUrl", stravaOAuthService.buildAuthorizeUrl(AuthService.requireCurrentUserId()));
    }

    @GetMapping("/strava/status")
    Map<String, Object> stravaStatus() {
        return stravaOAuthService.status(AuthService.requireCurrentUserId());
    }

    @DeleteMapping("/strava")
    ResponseEntity<Void> stravaDisconnect() {
        stravaOAuthService.disconnect(AuthService.requireCurrentUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/strava/callback")
    ResponseEntity<Void> stravaCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state) {
        String redirect = stravaOAuthService.handleCallback(code, state);
        return ResponseEntity.status(HttpStatus.FOUND).header("Location", redirect).build();
    }
}

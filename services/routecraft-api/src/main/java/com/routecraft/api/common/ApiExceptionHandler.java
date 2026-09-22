package com.routecraft.api.common;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.routecraft.api.auth.ForbiddenException;
import com.routecraft.api.auth.UnauthorizedException;

@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(messageBody(error.getMessage(), "Invalid request."));
    }

    @ExceptionHandler(UnauthorizedException.class)
    ResponseEntity<Map<String, String>> unauthorized(UnauthorizedException error) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(messageBody(error.getMessage(), "Authentication required."));
    }

    @ExceptionHandler(ForbiddenException.class)
    ResponseEntity<Map<String, String>> forbidden(ForbiddenException error) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(messageBody(error.getMessage(), "Access denied."));
    }

    @ExceptionHandler({ BadCredentialsException.class, AuthenticationException.class })
    ResponseEntity<Map<String, String>> badCredentials(Exception error) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(messageBody("Invalid email or password.", "Invalid email or password."));
    }

    @ExceptionHandler({ MethodArgumentNotValidException.class, HttpMessageNotReadableException.class })
    ResponseEntity<Map<String, String>> invalidRequest(Exception error) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(messageBody("Invalid request body.", "Invalid request body."));
    }

    private static Map<String, String> messageBody(String message, String fallback) {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("message", message == null || message.isBlank() ? fallback : message);
        return body;
    }
}

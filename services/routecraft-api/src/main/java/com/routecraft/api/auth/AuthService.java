package com.routecraft.api.auth;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Service
public class AuthService {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final int MIN_PASSWORD = 8;
    private static final int MAX_PASSWORD = 128;

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository =
            new HttpSessionSecurityContextRepository();

    public AuthService(
            UserRepository users,
            PasswordEncoder passwords,
            AuthenticationManager authenticationManager) {
        this.users = users;
        this.passwords = passwords;
        this.authenticationManager = authenticationManager;
    }

    public UserResponse register(RegisterRequest request, HttpServletRequest http, HttpServletResponse response) {
        String email = normalizeEmail(request.email());
        String displayName = requireDisplayName(request.displayName());
        String password = requirePassword(request.password());
        if (users.findByEmail(email).isPresent()) {
            throw new IllegalArgumentException("An account with that email already exists.");
        }
        try {
            users.insert(UUID.randomUUID(), email, passwords.encode(password), displayName);
        } catch (DuplicateKeyException error) {
            throw new IllegalArgumentException("An account with that email already exists.");
        }
        return establishSession(email, password, http, response);
    }

    public UserResponse login(LoginRequest request, HttpServletRequest http, HttpServletResponse response) {
        String email = normalizeEmail(request.email());
        requirePassword(request.password());
        return establishSession(email, request.password(), http, response);
    }

    public void logout(HttpServletRequest request, HttpServletResponse response) {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    public UserResponse currentUser() {
        return UserResponse.from(requireCurrentUser());
    }

    public static AppUser requireCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AppUser user)) {
            throw new UnauthorizedException("Authentication required.");
        }
        return user;
    }

    public static Optional<AppUser> currentUserOptional() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AppUser user) {
            return Optional.of(user);
        }
        return Optional.empty();
    }

    public static UUID requireCurrentUserId() {
        return requireCurrentUser().id();
    }

    private UserResponse establishSession(
            String email,
            String password,
            HttpServletRequest request,
            HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, password));

        HttpSession existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }
        request.getSession(true);

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        AppUser user = users.findByEmail(email)
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password."));
        return UserResponse.from(user);
    }

    static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email is required.");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (!EMAIL.matcher(normalized).matches() || normalized.length() > 254) {
            throw new IllegalArgumentException("Email is invalid.");
        }
        return normalized;
    }

    static String requireDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Display name is required.");
        }
        String trimmed = displayName.trim();
        if (trimmed.length() > 80) {
            throw new IllegalArgumentException("Display name is too long.");
        }
        return trimmed;
    }

    static String requirePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD) {
            throw new IllegalArgumentException("Password must be at least 8 characters.");
        }
        if (password.length() > MAX_PASSWORD) {
            throw new IllegalArgumentException("Password is too long.");
        }
        return password;
    }

    public record RegisterRequest(String email, String password, String displayName) {}

    public record LoginRequest(String email, String password) {}

    public record UserResponse(UUID id, String email, String displayName) {
        static UserResponse from(AppUser user) {
            return new UserResponse(user.id(), user.email(), user.displayName());
        }
    }
}

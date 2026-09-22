package com.routecraft.api.auth;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Service
public class AuthService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int MAX_PASSWORD_LENGTH = 128;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
    }

    public UserResponse register(
            RegisterRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        String email = normalizeEmail(request.email());
        String displayName = requireDisplayName(request.displayName());
        String password = requirePassword(request.password());

        if (userRepository.findByEmail(email).isPresent()) {
            throw new IllegalArgumentException("An account with that email already exists.");
        }

        AppUser created;
        try {
            created = userRepository.insert(
                    UUID.randomUUID(),
                    email,
                    passwordEncoder.encode(password),
                    displayName);
        } catch (DuplicateKeyException error) {
            throw new IllegalArgumentException("An account with that email already exists.");
        }

        authenticateSession(email, password, httpRequest, httpResponse);
        return UserResponse.from(created);
    }

    public UserResponse login(
            LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        String email = normalizeEmail(request.email());
        requirePassword(request.password());
        authenticateSession(email, request.password(), httpRequest, httpResponse);
        AppUser user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password."));
        return UserResponse.from(user);
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

    public static UUID requireCurrentUserId() {
        return requireCurrentUser().id();
    }

    private void authenticateSession(
            String email,
            String password,
            HttpServletRequest request,
            HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, password));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        HttpSessionSecurityContextRepository repository = new HttpSessionSecurityContextRepository();
        repository.saveContext(SecurityContextHolder.getContext(), request, response);
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email is required.");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (!EMAIL_PATTERN.matcher(normalized).matches() || normalized.length() > 254) {
            throw new IllegalArgumentException("Email is invalid.");
        }
        return normalized;
    }

    private static String requireDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Display name is required.");
        }
        String trimmed = displayName.trim();
        if (trimmed.length() > 80) {
            throw new IllegalArgumentException("Display name is too long.");
        }
        return trimmed;
    }

    private static String requirePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("Password must be at least 8 characters.");
        }
        if (password.length() > MAX_PASSWORD_LENGTH) {
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

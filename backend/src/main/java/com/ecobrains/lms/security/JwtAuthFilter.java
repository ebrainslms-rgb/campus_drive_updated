package com.ecobrains.lms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Reads "Authorization: Bearer <token>" on every request, validates it and, if valid,
 * populates the SecurityContext with a role of ROLE_ADMIN or ROLE_STUDENT so that
 * @PreAuthorize / requestMatchers(...).hasRole(...) can enforce access control.
 * A missing/invalid token simply means the request proceeds unauthenticated - the
 * security chain then decides (per endpoint) whether that's allowed.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                     @NonNull HttpServletResponse response,
                                     @NonNull FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                if (jwtService.isTokenValid(token)) {
                    String role = jwtService.extractRole(token);
                    String subject = jwtService.extractSubject(token);

                    if (role != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                        AuthenticatedPrincipal principal = new AuthenticatedPrincipal(
                                subject,
                                "STUDENT".equals(role) ? jwtService.extractStudentId(token) : null
                        );
                        UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                                principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))
                        );
                        authToken.setDetails(token);
                        SecurityContextHolder.getContext().setAuthentication(authToken);
                    }
                }
            } catch (Exception ignored) {
                // Invalid/expired token -> treat as unauthenticated; downstream rules will 401/403.
            }
        }

        filterChain.doFilter(request, response);
    }
}

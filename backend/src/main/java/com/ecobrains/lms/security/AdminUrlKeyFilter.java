package com.ecobrains.lms.security;

import com.ecobrains.lms.config.AdminProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Requires the configured Admin URL key on protected Admin API calls, including Admin login.
 */
@Component
public class AdminUrlKeyFilter extends OncePerRequestFilter {

    private final AdminProperties adminProperties;

    public AdminUrlKeyFilter(AdminProperties adminProperties) {
        this.adminProperties = adminProperties;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                     @NonNull HttpServletResponse response,
                                     @NonNull FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();

        boolean isAdminApi = path.startsWith("/api/admin/");
        // /api/admin/config remains available to recover a rotated URL key.
        boolean isConfig = path.equals("/api/admin/config");
        boolean isLogin = path.equals("/api/admin/auth/login");
        // Public registration and lookup endpoints.
        boolean isPublicLookup = path.equals("/api/admin/colleges/public") || path.equals("/api/admin/courses/public")
                || path.startsWith("/api/admin/banners/public/")
                || path.equals("/api/admin/site-content/public")
                || path.equals("/api/admin/dropdown-options/public")
                || path.equals("/api/admin/exam-settings/public")
                || path.equals("/api/admin/registration-settings/public") || path.equals("/api/admin/registration-fields/public");

        if (isAdminApi && !isConfig && !isLogin && !isPublicLookup) {
            String provided = request.getHeader("x-admin-url-key");
            if (provided == null) provided = request.getParameter("adminKey");

            String expected = adminProperties.getUrlKey();
            if (expected != null && !expected.isBlank() && !expected.equals(provided)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"message\":\"Forbidden: Invalid Admin URL Key\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}

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
 * Preserves the original app's extra "admin URL key" layer: every /api/admin/**
 * call (other than the login endpoint itself, which only needs username+password)
 * must also present the shared x-admin-url-key header/query param configured in
 * application.properties (app.admin.url-key). This mirrors the frontend's
 * /{key}/admin route convention and adds a second, independently-rotatable secret
 * on top of the JWT.
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
        boolean isLogin = path.equals("/api/admin/auth/login");
        // /api/admin/config is reachable with only a valid JWT (no url-key) so a
        // session can recover after the key is rotated server-side - see ConfigController.
        boolean isConfig = path.equals("/api/admin/config");
        // These are deliberately public (used on the unauthenticated student
        // registration/login/rules pages), mirroring the original Express router where
        // adminAuth was only wired in *after* the /public sub-route.
        boolean isPublicLookup = path.equals("/api/admin/colleges/public") || path.equals("/api/admin/courses/public")
                || path.startsWith("/api/admin/banners/public/")
                || path.equals("/api/admin/site-content/public")
                || path.equals("/api/admin/dropdown-options/public")
                || path.equals("/api/admin/exam-settings/public");

        if (isAdminApi && !isLogin && !isConfig && !isPublicLookup) {
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

package com.ecobrains.lms.security;

import com.ecobrains.lms.service.PortalUserService;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class PortalPermissionFilter extends OncePerRequestFilter {
    private final PortalUserService service;
    public PortalPermissionFilter(PortalUserService service) { this.service = service; }

    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String path = req.getRequestURI();
        if (!path.startsWith("/api/admin/") || path.equals("/api/admin/auth/login") || path.equals("/api/admin/auth/session") || path.equals("/api/admin/config") || path.endsWith("/public") || path.contains("/public/")) { chain.doFilter(req, res); return; }
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_USER"))) { chain.doFilter(req, res); return; }
        String key = permission(path);
        if (key == null) { chain.doFilter(req, res); return; }
        // Shortlist & Export only downloads a file (POST just carries the id list), so it needs
        // the same Drive Control READ access as the existing GET /export.
        String access = req.getMethod().equalsIgnoreCase("GET") || path.endsWith("/bulk/preview") || path.endsWith("/shortlist/export") ? "READ" : "MODIFY";
        AuthenticatedPrincipal p = (AuthenticatedPrincipal) auth.getPrincipal();
        if (p.userId() == null || !service.isActive(p.userId())) {
            res.setStatus(401); res.setContentType("application/json"); res.getWriter().write("{\"message\":\"Your user account is inactive.\"}"); return;
        }
        if (!service.has(p.userId(), key, access)) {
            res.setStatus(403); res.setContentType("application/json");
            res.getWriter().write("{\"message\":\"You don't have permission to perform this action.\"}"); return;
        }
        chain.doFilter(req, res);
    }

    private String permission(String p) {
        if (p.contains("/auth/")) return null;
        // Export popup columns and personal shortcuts: every ACTIVE account may use them
        // (same rule as the dashboard), whatever its area permissions.
        if (p.contains("/export-columns") || p.contains("/export-shortcuts")) return "DASHBOARD";
        if (p.contains("/user-control") || p.contains("/registration-settings") || p.contains("/registration-content") || p.contains("/registration-fields") || p.contains("/dropdown-options") || p.contains("/site-content") || p.contains("/banners") || p.contains("/exam-settings") || p.contains("/export-settings")) return "ADMIN_ONLY";
        if (p.contains("/export")) return "EXAM_DRIVE";
        if (p.contains("/questions")) return "QUESTION";
        if (p.contains("/courses")) return "COURSE";
        if (p.contains("/students")) return "STUDENT";
        if (p.contains("/colleges") || p.contains("/drives") || p.contains("/exams") || p.contains("/live/") || p.contains("/banners") || p.contains("/exam-settings")) return "EXAM_DRIVE";
        if (p.contains("/dashboard")) return "DASHBOARD";
        return null;
    }
}

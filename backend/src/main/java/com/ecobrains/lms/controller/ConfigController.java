package com.ecobrains.lms.controller;

import com.ecobrains.lms.config.AdminProperties;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Lets an already-authenticated admin (valid JWT) discover the *current*
 * admin URL key if it was rotated server-side, so the SPA can redirect the
 * session to the new /{key}/admin URL. Deliberately requires only the JWT,
 * not the (possibly now-invalid) key itself - see AdminUrlKeyFilter, which
 * exempts nothing else under /api/admin/**.
 */
@RestController
@RequestMapping("/api/admin/config")
public class ConfigController {

    private final AdminProperties adminProperties;

    public ConfigController(AdminProperties adminProperties) {
        this.adminProperties = adminProperties;
    }

    @GetMapping
    public Map<String, String> getConfig() {
        // Reaching this method at all already means JwtAuthFilter accepted a valid
        // admin JWT (SecurityConfig requires ROLE_ADMIN on /api/admin/**), and
        // AdminUrlKeyFilter runs before it - so exempt this one path from the key
        // check at the filter level instead. See AdminUrlKeyFilter.
        return Map.of("adminUrlKey", adminProperties.getUrlKey() != null ? adminProperties.getUrlKey() : "");
    }
}

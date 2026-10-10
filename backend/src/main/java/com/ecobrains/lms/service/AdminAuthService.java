package com.ecobrains.lms.service;

import com.ecobrains.lms.config.AdminProperties;
import com.ecobrains.lms.dto.request.AdminLoginRequest;
import com.ecobrains.lms.dto.response.AdminLoginResponse;
import com.ecobrains.lms.entity.AdminLog;
import com.ecobrains.lms.entity.PortalUser;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.AdminLogRepository;
import com.ecobrains.lms.security.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

@Service
public class AdminAuthService {
    private final JwtService jwt;
    private final AdminLogRepository logs;
    private final AdminProperties adminProperties;
    private final PortalUserService portalUsers;

    public AdminAuthService(JwtService jwt, AdminLogRepository logs, AdminProperties adminProperties, PortalUserService portalUsers) {
        this.jwt = jwt;
        this.logs = logs;
        this.adminProperties = adminProperties;
        this.portalUsers = portalUsers;
    }

    public AdminLoginResponse login(AdminLoginRequest request, HttpServletRequest httpRequest) {
        String configuredEmail = adminProperties.getUsername();
        if (configuredEmail == null || configuredEmail.isBlank()
                || adminProperties.getPassword() == null || adminProperties.getPassword().isBlank()) {
            throw ApiException.unauthorized(PortalUserService.INVALID_LOGIN); // never reveal server configuration
        }

        PortalUser admin = portalUsers.authenticateConfiguredAdmin(request.email(), request.password());
        String token = jwt.generateAdminToken(admin.getId(), admin.getEmail());
        try {
            logs.save(AdminLog.builder()
                    .adminEmail(configuredEmail.trim().toLowerCase())
                    .action("LOGIN")
                    .ipAddress(httpRequest.getRemoteAddr())
                    .build());
        } catch (Exception ignored) {
        }
        return new AdminLoginResponse(token, "Login successful", adminProperties.getUrlKey());
    }

    public AdminLoginResponse refresh(String email) {
        String configuredEmail = adminProperties.getUsername();
        if (configuredEmail == null || configuredEmail.isBlank() || email == null || !configuredEmail.equalsIgnoreCase(email)) {
            throw ApiException.unauthorized("Invalid session.");
        }
        PortalUser admin = portalUsers.authenticateConfiguredAdmin(configuredEmail, adminProperties.getPassword());
        return new AdminLoginResponse(jwt.generateAdminToken(admin.getId(), admin.getEmail()), "Session refreshed", adminProperties.getUrlKey());
    }
}

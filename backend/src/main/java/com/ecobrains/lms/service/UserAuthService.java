package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.AdminLoginRequest;
import com.ecobrains.lms.dto.response.AdminLoginResponse;
import com.ecobrains.lms.config.AdminProperties;
import org.springframework.stereotype.Service;

@Service
public class UserAuthService {
    private final PortalUserService portalUsers;
    private final AdminProperties adminProperties;

    public UserAuthService(PortalUserService portalUsers, AdminProperties adminProperties) {
        this.portalUsers = portalUsers;
        this.adminProperties = adminProperties;
    }

    public AdminLoginResponse login(AdminLoginRequest request) {
        var user = portalUsers.authenticateRole(request.email(), request.password(), "USER");
        return new AdminLoginResponse(portalUsers.token(user), "Login successful", adminProperties.getUrlKey());
    }

    public AdminLoginResponse refresh(Long userId) {
        var user = portalUsers.findActiveRole(userId, "USER");
        return new AdminLoginResponse(portalUsers.token(user), "Session refreshed", adminProperties.getUrlKey());
    }
}

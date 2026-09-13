package com.ecobrains.lms.service;

import com.ecobrains.lms.config.AdminProperties;
import com.ecobrains.lms.dto.request.AdminLoginRequest;
import com.ecobrains.lms.dto.response.AdminLoginResponse;
import com.ecobrains.lms.entity.AdminLog;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.AdminLogRepository;
import com.ecobrains.lms.security.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AdminAuthService {

    private final AdminProperties adminProperties;
    private final JwtService jwtService;
    private final AdminLogRepository adminLogRepository;

    public AdminAuthService(AdminProperties adminProperties, JwtService jwtService, AdminLogRepository adminLogRepository) {
        this.adminProperties = adminProperties;
        this.jwtService = jwtService;
        this.adminLogRepository = adminLogRepository;
    }

    public AdminLoginResponse login(AdminLoginRequest request, HttpServletRequest httpRequest) {
        boolean valid = adminProperties.getUsername() != null
                && adminProperties.getUsername().equalsIgnoreCase(request.email())
                && adminProperties.getPassword() != null
                && adminProperties.getPassword().equals(request.password());

        if (!valid) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        String token = jwtService.generateAdminToken(request.email());

        adminLogRepository.save(AdminLog.builder()
                .adminEmail(request.email())
                .action("LOGIN")
                .ipAddress(httpRequest.getRemoteAddr())
                .build());

        return new AdminLoginResponse(token, "Login successful");
    }
}

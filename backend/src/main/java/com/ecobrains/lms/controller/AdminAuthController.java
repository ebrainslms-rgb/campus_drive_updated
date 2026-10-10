package com.ecobrains.lms.controller;

import com.ecobrains.lms.dto.request.AdminLoginRequest;
import com.ecobrains.lms.dto.response.AdminLoginResponse;
import com.ecobrains.lms.security.AuthenticatedPrincipal;
import com.ecobrains.lms.service.AdminAuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {
    private final AdminAuthService adminAuthService;
    public AdminAuthController(AdminAuthService adminAuthService) { this.adminAuthService = adminAuthService; }

    @PostMapping("/login")
    public ResponseEntity<AdminLoginResponse> login(@Valid @RequestBody AdminLoginRequest request, HttpServletRequest httpRequest) { return ResponseEntity.ok(adminAuthService.login(request, httpRequest)); }

    @GetMapping("/session")
    public ResponseEntity<AdminLoginResponse> session() {
        AuthenticatedPrincipal principal = (AuthenticatedPrincipal) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return ResponseEntity.ok(adminAuthService.refresh(principal.subject()));
    }
}
